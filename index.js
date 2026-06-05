const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// URL do L2 Amerika que você passou
const URL = "https://www.l2amerika.com/?page=boss-status";

// Guarda o último estado dos bosses para saber se mudou de Dead para Alive
let lastBossStatus = {};
let isFirstRun = true;

async function checkBosses() {
  try {
    // Puxa o HTML do site
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    // Mapeia as linhas da tabela de bosses do site
    $("table tr").each((index, element) => {
      // Pula o cabeçalho da tabela
      if (index === 0) return;

      const cols = $(element).find("td");
      if (cols.length >= 2) {
        // Pega o nome do boss e limpa espaços extras
        const bossName = $(cols[0]).text().trim();
        // Pega o status (Alive / Dead)
        const bossStatus = $(cols[1]).text().trim();
        // Pega o tempo de respawn se houver
        const respawnTime = cols[2] ? $(cols[2]).text().trim() : "N/A";

        if (!bossName) return;

        // Se for a primeira vez rodando, ele só memoriza o estado atual sem floodar o Discord
        if (isFirstRun) {
          lastBossStatus[bossName] = bossStatus;
          return;
        }

        // 🔥 DETECÇÃO CHAVE: Se o boss estava 'Dead' (ou não listado) e agora mudou para 'Alive'
        if (bossStatus.toLowerCase().includes("alive") && lastBossStatus[bossName] !== bossStatus) {
          
          sendAlert(bossName, "ALIVE", "🟩 VIVO! Corram para o Boss!", 0x00FF00);
        } 
        // Se quiser avisar quando ele MORRE também, basta remover as barras '/*' e '*/' abaixo:
        /*
        else if (bossStatus.toLowerCase().includes("dead") && lastBossStatus[bossName] !== bossStatus) {
          sendAlert(bossName, "DEAD", `🟥 MORREU! Respawn estimado: ${respawnTime}`, 0xFF0000);
        }
        */

        // Atualiza o histórico com o status atual
        lastBossStatus[bossName] = bossStatus;
      }
    });

    if (isFirstRun) {
      console.log("Status inicial dos bosses carregado com sucesso!");
      isFirstRun = false;
    }

  } catch (err) {
    console.error("Erro ao ler o site do L2 Amerika:", err.message);
  }
}

function sendAlert(bossName, status, description, color) {
  // 🆔 ID do seu canal #boss-amerika já configurado aqui!
  const channel = client.channels.cache.get("1512375638781202432");

  if (!channel) {
    console.log(`Canal não encontrado para enviar o alerta do ${bossName}`);
    return;
  }

  // Cria o layout bonitão (Embed)
  const embed = new EmbedBuilder()
    .setTitle(`📢 ALERTA DE RAID BOSS — ${bossName.toUpperCase()}`)
    .setDescription(description)
    .setColor(color)
    .addFields(
      { name: "👑 Boss", value: bossName, inline: true },
      { name: "📊 Status Atual", value: status, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "L2 Amerika Monitor" });

  // Envia marcando @everyone para todo mundo do servidor ver
  channel.send({ content: "⚠️ @everyone", embeds: [embed] });
}

client.once("ready", () => {
  console.log(`🤖 Bot logado com sucesso como: ${client.user.tag}`);
  console.log("🔎 Monitoramento dos Bosses iniciado (Checando a cada 60 segundos)...");

  // Roda assim que liga e depois a cada 60 segundos
  checkBosses();
  setInterval(checkBosses, 60000);
});

// 🔴 APENAS TROQUE AQUI: Coloque o Token do seu Bot entre as aspas
client.login(process.env.DISCORD_TOKEN);
