const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

// 🌐 CÓDIGO DA PORTA FAKE PARA O UPTIMEROBOT
const http = require("http");
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  if (req.method !== "HEAD") {
    res.write("Bot L2 Amerika Online!");
  }
  res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const URL = "https://www.l2amerika.com/?page=boss-status";

let lastBossStatus = {};
let activeTimers = {};
let isFirstRun = true;

async function checkBosses() {
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    $("table").each((tableIndex, tableElement) => {
      $(tableElement).find("tr").each((index, element) => {
        if (index === 0) return; // Pula cabeçalho

        const cols = $(element).find("td");
        if (cols.length >= 3) {
          const bossName = $(cols[0]).text().trim();
          const bossStatus = $(cols[1]).text().trim().toUpperCase();
          const respawnTime = cols[2] ? $(cols[2]).text().trim() : "N/A";

          if (!bossName) return;

          // 1️⃣ LÓGICA EM TEMPO REAL: Se mudou para ALIVE agora, avisa direto!
          if (bossStatus.includes("ALIVE")) {
            if (!isFirstRun && lastBossStatus[bossName] !== bossStatus) {
              sendAlert(bossName, "ALIVE", "🟩 **VIVO NO GAME!** O boss deu as caras, corram para o spot! ⚔️", 0x00FF00);
            }
          }

          // 2️⃣ LÓGICA DO AGENDADOR: Se está morto, programa os alarmes futuros
          if (bossStatus.includes("DEAD") && respawnTime !== "N/A" && respawnTime !== "-" && respawnTime !== "") {
            try {
              const [dataPart, horaPart] = respawnTime.split(" ");
              if (dataPart && horaPart) {
                const [dia, mes, ano] = dataPart.split("/");
                const [hora, minuto] = horaPart.split(":");
                
                if (dia && mes && ano && hora && minuto) {
                  // Força a montagem no padrão correto ISO com fuso horário de Brasília
                  const respawnDate = new Date(`${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:00-03:00`);
                  const agora = new Date();
                  const timerKey = `${bossName}_${respawnTime}`;

                  if (!activeTimers[timerKey]) {
                    // Limpa agendamentos velhos desse boss se o horário mudou
                    if (activeTimers[bossName]) {
                      clearTimeout(activeTimers[bossName].oneHour);
                      clearTimeout(activeTimers[bossName].spawn);
                    }

                    activeTimers[bossName] = { oneHour: null, spawn: null };
                    activeTimers[timerKey] = true;

                    const tempoRestanteMs = respawnDate.getTime() - agora.getTime();

                    // Alarme de 1 Hora Antes
                    const umHoraMs = tempoRestanteMs - (60 * 60 * 1000);
                    if (umHoraMs > 0) {
                      activeTimers[bossName].oneHour = setTimeout(() => {
                        sendAlert(
                          bossName, 
                          "RESPAWN EM BREVE", 
                          `⚠️ **AVISO DE 1 HORA:** O chefe está previsto para nascer logo mais!\n📅 **Data/Hora:** \`${respawnTime}\`\nPreparem as PTs!`, 
                          0xFFFF00
                        );
                      }, umHoraMs);
                      console.log(`[⏱️] Alarme de 1h agendado para: ${bossName} (${respawnTime})`);
                    }

                    // Alarme do Nascimento Exato
                    if (tempoRestanteMs > 0) {
                      activeTimers[bossName].spawn = setTimeout(() => {
                        sendAlert(
                          bossName, 
                          "ALIVE", 
                          `🟩 **HORÁRIO ALVO ATINGIDO!** O boss chegou na hora prevista de nascimento!\n📅 **Data Alvo:** \`${respawnTime}\`\nVerifiquem o spot!`, 
                          0x00FF00
                        );
                      }, tempoRestanteMs);
                      console.log(`[⚔️] Alarme de spawn agendado para: ${bossName} (${respawnTime})`);
                    }
                  }
                }
              }
            } catch (e) {
              console.error(`Erro ao agendar data para ${bossName}:`, e.message);
            }
          }

          // Salva o estado atual para comparar na próxima rodada de 60 segundos
          lastBossStatus[bossName] = bossStatus;
        }
      });
    });

    if (isFirstRun) {
      console.log("✅ Primeira varredura completa. Sistema de monitoramento híbrido online!");
      isFirstRun = false;
    }

  } catch (err) {
    console.error("Erro ao ler o site do L2 Amerika:", err.message);
  }
}

function sendAlert(bossName, status, description, color) {
  const channel = client.channels.cache.get("1512375638781202432");
  if (!channel) return;

  const nameLower = bossName.toLowerCase();
  const isEpic = nameLower.includes("core") || nameLower.includes("baium") || nameLower.includes("queen ant") || nameLower.includes("orfen") || nameLower.includes("antharas") || nameLower.includes("valakas") || nameLower.includes("beleth");
  const isMini = nameLower.includes("mardil");
  
  let tituloTipo = "RAID BOSS";
  if (isEpic) tituloTipo = "EPIC BOSS";
  else if (isMini) tituloTipo = "MINI BOSS";

  const embed = new EmbedBuilder()
    .setTitle(`📢 ALERTA DE ${tituloTipo} — ${bossName.toUpperCase()}`)
    .setDescription(description)
    .setColor(color)
    .addFields(
      { name: "👑 Boss", value: bossName, inline: true },
      { name: "📊 Status Atual", value: status, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "L2 Amerika Monitor" });

  channel.send({ content: "⚠️ @everyone", embeds: [embed] });
}

client.once("ready", () => {
  console.log(`🤖 Bot ativo com Sincronização ISO-BR: ${client.user.tag}`);
  checkBosses();
  setInterval(checkBosses, 60000); // Varre o site a cada 60 segundos para garantir a mudança instantânea
});

client.login(process.env.DISCORD_TOKEN);
