const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

// 🌐 CÓDIGO DA PORTA FAKE: Evita que a Render derrube o Web Service por falta de tráfego
const http = require("http");
http.createServer((req, res) => {
  res.write("Bot L2 Amerika Online!");
  res.end();
}).listen(process.env.PORT || 3000);

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

// 🛡️ LISTA DE CONTROLE: Impede que o bot floode o chat mandando alerta de 1 hora a cada minuto
let warnedOneHour = {};

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
      // Mudado para >= 3 para garantir a leitura da coluna de Respawn
      if (cols.length >= 3) {
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
          // Se o bicho já nascer vivo no primeiro spawn, garante que o alerta de 1 hora tá limpo
          if (bossStatus.toLowerCase().includes("alive")) {
            warnedOneHour[bossName] = false;
          }
          return;
        }

        // ⏰ --- NOVA LÓGICA: AVISO DE 1 HORA ANTES ---
        if (bossStatus.toLowerCase().includes("dead") && respawnTime !== "N/A" && respawnTime !== "-") {
          try {
            // Transforma "DD/MM/AAAA HH:MM" do site em um objeto de data do JavaScript
            const [dataPart, horaPart] = respawnTime.split(" ");
            const [dia, mes, ano] = dataPart.split("/");
            const [hora, minuto] = horaPart.split(":");
            
            const respawnDate = new Date(ano, mes - 1, dia, hora, minuto);
            const agora = new Date();

            // Calcula a diferença exata em minutos entre o respawn e o agora
            const diferencaMinutos = Math.round((respawnDate - agora) / 60000);

            // Se faltar entre 55 e 65 minutos (janela de 1 hora de antecedência) e ainda não avisou neste ciclo
            if (diferencaMinutos >= 55 && diferencaMinutos <= 65 && !warnedOneHour[bossName]) {
              sendAlert(
                bossName, 
                "RESPAWN EM BREVE", 
                `⚠️ **AVISO DE 1 HORA:** Este Boss está previsto para nascer logo mais!\n📅 **Data/Hora:** \`${respawnTime}\`\nReúnam o clã e preparem as PTs!`, 
                0xFFFF00
              );
              warnedOneHour[bossName] = true; // Marca como avisado para não repetir no próximo minuto
            }
          } catch (e) {
            console.error(`Erro ao calcular tempo para o boss ${bossName}:`, e);
          }
        }

        // Se o Boss estiver vivo, resetamos o alerta de 1 hora para que funcione na próxima vez que ele morrer
        if (bossStatus.toLowerCase().includes("alive")) {
          warnedOneHour[bossName] = false;
        }

        // 🔥 DETECÇÃO CHAVE: Se o boss estava 'Dead' (ou não listado) e agora mudou para 'Alive'
        if (bossStatus.toLowerCase().includes("alive") && lastBossStatus[bossName] !== bossStatus) {
          sendAlert(bossName, "ALIVE", "🟩 VIVO! Corram para o Boss!", 0x00FF00);
        } 

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

// 🔴 Mantido via variável de ambiente protegida conforme arrumamos!
client.login(process.env.DISCORD_TOKEN);
