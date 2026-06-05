const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

// 🌐 CÓDIGO DA PORTA FAKE ADAPTADO
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

// URL do L2 Amerika
const URL = "https://www.l2amerika.com/?page=boss-status";

let lastBossStatus = {};
let isFirstRun = true;
let warnedOneHour = {};

async function checkBosses() {
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    // 🎯 AJUSTE CHAVE: Procura em TODAS as tabelas da página (Raids e Epics)
    $("table").each((tableIndex, tableElement) => {
      $(tableElement).find("tr").each((index, element) => {
        // Pula o cabeçalho de cada tabela
        if (index === 0) return;

        const cols = $(element).find("td");
        if (cols.length >= 3) {
          const bossName = $(cols[0]).text().trim();
          const bossStatus = $(cols[1]).text().trim();
          const respawnTime = cols[2] ? $(cols[2]).text().trim() : "N/A";

          if (!bossName) return;

          if (isFirstRun) {
            lastBossStatus[bossName] = bossStatus;
            if (bossStatus.toLowerCase().includes("alive")) {
              warnedOneHour[bossName] = false;
            }
            return;
          }

          // ⏰ --- LÓGICA DE AVISO DE 1 HORA REFORMULADA ---
          if (bossStatus.toLowerCase().includes("dead") && respawnTime !== "N/A" && respawnTime !== "-") {
            try {
              const [dataPart, horaPart] = respawnTime.split(" ");
              const [dia, mes, ano] = dataPart.split("/");
              const [hora, minuto] = horaPart.split(":");
              
              const respawnDate = new Date(ano, mes - 1, dia, hora, minuto);
              const agora = new Date();

              // Diferença em minutos
              const diferencaMinutos = Math.round((respawnDate - agora) / 60000);

              // GATILHO SEGURO: Se estiver dentro da janela de 1 hora (entre 0 e 60 min restantes) e ainda não avisou
              if (diferencaMinutos > 0 && diferencaMinutos <= 60 && !warnedOneHour[bossName]) {
                
                // Identifica se é Epic ou Raid para caprichar na mensagem
                const nameLower = bossName.toLowerCase();
                const isEpic = nameLower.includes("core") || nameLower.includes("baium") || nameLower.includes("queen ant") || nameLower.includes("orfen") || nameLower.includes("antharas") || nameLower.includes("valakas") || nameLower.includes("beleth");
                const isMini = nameLower.includes("mardil");
                
                let tipoTexto = "RAID BOSS";
                if (isEpic) tipoTexto = "🔥 EPIC BOSS 🔥";
                else if (isMini) tipoTexto = "MINI BOSS";

                sendAlert(
                  bossName, 
                  "RESPAWN EM BREVE", 
                  `⚠️ **AVISO DE 1 HORA:** O ${tipoTexto} está previsto para nascer logo mais!\n📅 **Data/Hora:** \`${respawnTime}\`\nPreparem as PTs e os cristais!`, 
                  0xFFFF00
                );
                warnedOneHour[bossName] = true; 
              }
            } catch (e) {
              console.error(`Erro ao calcular tempo para o boss ${bossName}:`, e);
            }
          }

          if (bossStatus.toLowerCase().includes("alive")) {
            warnedOneHour[bossName] = false;
          }

          if (bossStatus.toLowerCase().includes("alive") && lastBossStatus[bossName] !== bossStatus) {
            sendAlert(bossName, "ALIVE", "🟩 VIVO! Corram para o Boss!", 0x00FF00);
          } 

          lastBossStatus[bossName] = bossStatus;
        }
      });
    });

    if (isFirstRun) {
      console.log("Status inicial de TODAS as tabelas carregado!");
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
  console.log(`🤖 Bot ativo: ${client.user.tag}`);
  checkBosses();
  setInterval(checkBosses, 60000);
});

client.login(process.env.DISCORD_TOKEN);
