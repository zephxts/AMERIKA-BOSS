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

// Armazena os IDs dos cronômetros ativos para não duplicar alarmes
let activeTimers = {}; 

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
          const bossStatus = $(cols[1]).text().trim();
          const respawnTime = cols[2] ? $(cols[2]).text().trim() : "N/A";

          if (!bossName) return;

          // Se o boss está morto e tem data válida de respawn
          if (bossStatus.toLowerCase().includes("dead") && respawnTime !== "N/A" && respawnTime !== "-") {
            try {
              const [dataPart, horaPart] = respawnTime.split(" ");
              const [dia, mes, ano] = dataPart.split("/");
              const [hora, minuto] = horaPart.split(":");
              
              // Gera a data alvo baseada no fuso da máquina (Render está em SP)
              const respawnDate = new Date(ano, mes - 1, dia, hora, minuto);
              const agora = new Date();

              // Chave única baseada no nome + data para saber se já agendamos ESSE respawn específico
              const timerKey = `${bossName}_${respawnTime}`;

              if (!activeTimers[timerKey]) {
                // Cancela alarmes antigos pendentes desse mesmo boss se houver (caso a data tenha mudado)
                if (activeTimers[bossName]) {
                  clearTimeout(activeTimers[bossName].oneHour);
                  clearTimeout(activeTimers[bossName].spawn);
                }

                activeTimers[bossName] = { oneHour: null, spawn: null };
                activeTimers[timerKey] = true; // Marca que este horário já foi programado

                const tempoRestanteMs = respawnDate - agora;

                // 1️⃣ PROGRAMA O AVISO DE 1 HORA ANTES
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
                  console.log(`[⏱️] Alarme de 1h agendado para o boss: ${bossName}`);
                }

                // 2️⃣ PROGRAMA O AVISO DE NASCIMENTO (CRAVADO)
                if (tempoRestanteMs > 0) {
                  activeTimers[bossName].spawn = setTimeout(() => {
                    sendAlert(
                      bossName, 
                      "ALIVE", 
                      `🟩 **VIVO!** O boss acaba de atingir o horário de nascimento previsto!\n⚔️ Corram para o spot!`, 
                      0x00FF00
                    );
                  }, tempoRestanteMs);
                  console.log(`[⚔️] Alarme de nascimento agendado para o boss: ${bossName}`);
                }
              }
            } catch (e) {
              console.error(`Erro ao processar data do boss ${bossName}:`, e);
            }
          }
        }
      });
    });

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
  console.log(`🤖 Bot ativo com Agendador Inteligente: ${client.user.tag}`);
  // Roda a primeira vez para agendar tudo e repete a cada 5 minutos para checar novos boss mortos
  checkBosses();
  setInterval(checkBosses, 300000); 
});

client.login(process.env.DISCORD_TOKEN);
