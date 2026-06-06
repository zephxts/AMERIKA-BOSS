const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

// ─────────────────────────────────────────────
// 🌐 SERVIDOR HTTP FAKE PARA O UPTIMEROBOT
// ─────────────────────────────────────────────
const http = require("http");
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  if (req.method !== "HEAD") res.write("Bot L2 Amerika Online!");
  res.end();
}).listen(process.env.PORT || 3000);

// ─────────────────────────────────────────────
// ⚙️ CONFIGURAÇÕES (use variáveis de ambiente)
// ─────────────────────────────────────────────
const DISCORD_TOKEN      = process.env.DISCORD_TOKEN;
const CHANNEL_ID         = process.env.DISCORD_CHANNEL_ID || "1512375638781202432";
const BOSS_URL           = "https://www.l2amerika.com/?page=boss-status";
const CHECK_INTERVAL_MS  = 60 * 1000;          // varredura a cada 60s
const ALERT_COOLDOWN_MS  = 5 * 60 * 1000;      // cooldown de 5 min entre alertas do mesmo boss
const HTTP_TIMEOUT_MS    = 15 * 1000;           // timeout de 15s por requisição
const MAX_RETRIES        = 3;                   // tentativas antes de desistir
const RETRY_DELAY_MS     = 5 * 1000;            // espera 5s entre tentativas

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─────────────────────────────────────────────
// 🗃️ ESTADO GLOBAL
// ─────────────────────────────────────────────
let lastBossStatus  = {};   // { bossName: "ALIVE" | "DEAD" }
let activeTimers    = {};   // { bossName: { oneHour, spawn }, `bossName_respawnTime`: true }
let recentAlerts    = {};   // { bossName: timestamp } — cooldown anti-duplicata
let isFirstRun      = true;

// ─────────────────────────────────────────────
// 🛡️ HELPERS
// ─────────────────────────────────────────────

/**
 * Verifica se um alerta para este boss pode ser enviado agora.
 * Evita @everyone duplicado quando o timer e o scraping disparam juntos.
 */
function canAlert(bossName) {
  const last = recentAlerts[bossName];
  if (last && Date.now() - last < ALERT_COOLDOWN_MS) return false;
  recentAlerts[bossName] = Date.now();
  return true;
}

/**
 * Cancela e remove todos os timers ativos de um boss.
 * Chamado quando o respawn time muda ou o boss fica ALIVE.
 */
function clearBossTimers(bossName) {
  if (activeTimers[bossName]) {
    clearTimeout(activeTimers[bossName].oneHour);
    clearTimeout(activeTimers[bossName].spawn);
    delete activeTimers[bossName];
  }
  // Remove também todas as timerKeys desse boss
  Object.keys(activeTimers).forEach((key) => {
    if (key.startsWith(`${bossName}_`)) delete activeTimers[key];
  });
}

/**
 * Requisição HTTP com retry automático em caso de falha.
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
      return data;
    } catch (err) {
      const isLast = attempt === retries;
      console.warn(`[⚠️] Tentativa ${attempt}/${retries} falhou: ${err.message}`);
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

// ─────────────────────────────────────────────
// 📣 ENVIO DE ALERTA
// ─────────────────────────────────────────────
function sendAlert(bossName, status, description, color) {
  if (!canAlert(bossName)) {
    console.log(`[🔇] Alerta ignorado (cooldown ativo): ${bossName}`);
    return;
  }

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) {
    console.error(`[❌] Canal ${CHANNEL_ID} não encontrado no cache.`);
    return;
  }

  const nameLower = bossName.toLowerCase();
  const isEpic =
    nameLower.includes("core") ||
    nameLower.includes("baium") ||
    nameLower.includes("queen ant") ||
    nameLower.includes("orfen") ||
    nameLower.includes("antharas") ||
    nameLower.includes("valakas") ||
    nameLower.includes("beleth");
  const isMini = nameLower.includes("mardil");

  let tituloTipo = "RAID BOSS";
  if (isEpic) tituloTipo = "EPIC BOSS";
  else if (isMini) tituloTipo = "MINI BOSS";

  const embed = new EmbedBuilder()
    .setTitle(`📢 ALERTA DE ${tituloTipo} — ${bossName.toUpperCase()}`)
    .setDescription(description)
    .setColor(color)
    .addFields(
      { name: "👑 Boss",          value: bossName, inline: true },
      { name: "📊 Status Atual",  value: status,   inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "L2 Amerika Monitor" });

  channel
    .send({ content: "⚠️ @everyone", embeds: [embed] })
    .catch((err) => console.error(`[❌] Erro ao enviar alerta para ${bossName}:`, err.message));
}

// ─────────────────────────────────────────────
// ⏱️ AGENDADOR DE TIMERS DE RESPAWN
// ─────────────────────────────────────────────
function scheduleBossTimers(bossName, respawnTime) {
  if (respawnTime === "N/A" || respawnTime === "-" || !respawnTime) return;

  const timerKey = `${bossName}_${respawnTime}`;

  // Se este exato horário já foi agendado, não agenda de novo
  if (activeTimers[timerKey]) return;

  try {
    const [dataPart, horaPart] = respawnTime.split(" ");
    if (!dataPart || !horaPart) return;

    const [dia, mes, ano]   = dataPart.split("/");
    const [hora, minuto]    = horaPart.split(":");
    if (!dia || !mes || !ano || !hora || !minuto) return;

    // Data montada com fuso de Brasília (-03:00) — já converte para UTC internamente
    const respawnDate = new Date(
      `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto.padStart(2, "0")}:00-03:00`
    );

    // Data inválida (ex: site retornou lixo)
    if (isNaN(respawnDate.getTime())) {
      console.warn(`[⚠️] Data inválida para ${bossName}: "${respawnTime}"`);
      return;
    }

    const agora            = new Date();
    const tempoRestanteMs  = respawnDate.getTime() - agora.getTime();

    // Horário já passou — sem timer, mas log para diagnóstico
    if (tempoRestanteMs <= 0) {
      console.log(`[⏩] Respawn de ${bossName} (${respawnTime}) já passou — nenhum timer agendado.`);
      return;
    }

    // Cancela timers antigos desse boss (horário mudou no site)
    clearBossTimers(bossName);

    // Marca este timerKey como ativo
    activeTimers[timerKey]  = true;
    activeTimers[bossName]  = { oneHour: null, spawn: null };

    // ── Alarme de 1 Hora Antes ──────────────────
    const umHoraMs = tempoRestanteMs - 60 * 60 * 1000;
    if (umHoraMs > 0) {
      activeTimers[bossName].oneHour = setTimeout(() => {
        sendAlert(
          bossName,
          "RESPAWN EM BREVE",
          `⚠️ **AVISO DE 1 HORA:** O chefe está previsto para nascer logo mais!\n📅 **Data/Hora:** \`${respawnTime}\`\nPreparem as PTs!`,
          0xffff00
        );
      }, umHoraMs);
      console.log(`[⏱️] Alarme de 1h agendado para: ${bossName} (${respawnTime})`);
    }

    // ── Alarme do Nascimento Exato ───────────────
    activeTimers[bossName].spawn = setTimeout(() => {
      // Limpa as chaves após disparar para permitir re-agendamento futuro
      delete activeTimers[timerKey];
      delete activeTimers[bossName];

      sendAlert(
        bossName,
        "ALIVE",
        `🟩 **HORÁRIO ALVO ATINGIDO!** O boss chegou na hora prevista de nascimento!\n📅 **Data Alvo:** \`${respawnTime}\`\nVerifiquem o spot!`,
        0x00ff00
      );
    }, tempoRestanteMs);
    console.log(`[⚔️] Alarme de spawn agendado para: ${bossName} (${respawnTime})`);

  } catch (e) {
    console.error(`[❌] Erro ao agendar timer para ${bossName}:`, e.message);
  }
}

// ─────────────────────────────────────────────
// 🔍 VERIFICAÇÃO PRINCIPAL (scraping)
// ─────────────────────────────────────────────
async function checkBosses() {
  let html;
  try {
    html = await fetchWithRetry(BOSS_URL);
  } catch (err) {
    console.error(`[❌] Falha ao acessar o site após ${MAX_RETRIES} tentativas:`, err.message);
    return;
  }

  const $ = cheerio.load(html);

  // O site tem duas tabelas separadas: Epic Bosses e Raid Bosses.
  // Ambas têm 4 colunas: Name (0) | Level (1) | Status (2) | Respawn (3).
  // Iteramos todas as tabelas para não perder nenhuma categoria.
  $("table").each((_tableIdx, tableEl) => {
    $(tableEl).find("tr").each((index, element) => {
      if (index === 0) return; // pula cabeçalho

      const cols = $(element).find("td");
      if (cols.length < 3) return; // linha inválida / não é linha de boss

      const bossName    = $(cols[0]).text().trim();
      const bossStatus  = $(cols[2]).text().trim().toUpperCase(); // coluna 2 = Status
      const respawnTime = cols[3] ? $(cols[3]).text().trim() : ""; // coluna 3 = Respawn

      if (!bossName) return;

      // ── FILTRO: apenas Epic Bosses e Mardil ────
      const nameLower = bossName.toLowerCase();
      const isEpic = nameLower.includes("core") || nameLower.includes("baium") ||
        nameLower.includes("queen ant") || nameLower.includes("orfen") ||
        nameLower.includes("antharas") || nameLower.includes("valakas") ||
        nameLower.includes("beleth") || nameLower.includes("andreas");
      const isMardil = nameLower.includes("mardil");
      if (!isEpic && !isMardil) return;

      // ── CAMINHO 1: Boss ficou ALIVE agora ──────
      if (bossStatus.includes("ALIVE")) {
        if (!isFirstRun && lastBossStatus[bossName] !== bossStatus) {
          // Cancela timers pendentes — boss já nasceu
          clearBossTimers(bossName);
          sendAlert(
            bossName,
            "ALIVE",
            "🟩 **VIVO NO GAME!** O boss deu as caras, corram para o spot! ⚔️",
            0x00ff00
          );
        }
      }

      // ── CAMINHO 2: Boss está DEAD — agenda timers ──
      if (bossStatus.includes("DEAD")) {
        scheduleBossTimers(bossName, respawnTime);
      }

      // Salva estado para comparar na próxima rodada
      lastBossStatus[bossName] = bossStatus;
    });
  }); // fim $("table").each

  if (isFirstRun) {
    console.log("✅ Primeira varredura completa. Sistema híbrido online!");
    isFirstRun = false;
  }
}

// ─────────────────────────────────────────────
// 🤖 INICIALIZAÇÃO DO BOT
// ─────────────────────────────────────────────
client.once("ready", () => {
  console.log(`🤖 Bot ativo: ${client.user.tag}`);
  console.log(`📡 Canal de alertas: ${CHANNEL_ID}`);
  checkBosses();
  setInterval(checkBosses, CHECK_INTERVAL_MS);
});

client.login(DISCORD_TOKEN);
