const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

// 🌐 CÓDIGO DA PORTA FAKE ADAPTADO PARA O UPTIMEROBOT
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

    // ==========================================
    // 🧪 INÍCIO DO BLOCO DE TESTE TEMPORÁRIO
    // ==========================================
    if (!isFirstRun) {
      // 1. Força uma data de respawn fake para daqui a 30 minutos (Testa o alerta de 1 hora)
      let dataFake = new Date(Date.now() + 30 * 60000); 
      let horaFakeStr = `${String(dataFake.getDate()).padStart(2, '0')}/${String(dataFake.getMonth() + 1).padStart(2, '0')}/${dataFake.getFullYear()} ${String(dataFake.getHours()).padStart(2, '0')}:${String(dataFake.getMinutes()).padStart(2, '0')}`;
      
      if (!warnedOneHour["Core Fake"]) {
        const respawnDate = new Date(dataFake.getFullYear(), dataFake.getMonth(), dataFake.getDate(), dataFake.getHours(), dataFake.getMinutes());
        const diferencaMinutos = Math.round((respawnDate - new Date()) / 60000);
        if (diferencaMinutos > 0 && diferencaMinutos <= 60) {
          sendAlert("Core Fake", "RESPAWN EM BREVE", `⚠️ **AVISO DE TESTE:** O 🔥 EPIC BOSS 🔥 está previsto para nascer logo mais!\n📅 **Data/Hora:** \`${horaFakeStr}\``, 0xFFFF00);
          warnedOneHour["Core Fake"] = true;
        }
      }

      // 2. Simula um Boss que mudou de status para ALIVE (Testa o alerta de Vivo)
      if (lastBossStatus["Mardil Fake"] === "DEAD") {
        sendAlert("Mardil Fake", "ALIVE", "🟩 VIVO! (Teste de Nascimento)", 0x00FF00);
      }
      lastBossStatus["Mardil Fake"] = "ALIVE";
    } else {
      // Configura os status iniciais na primeira rodada do bot para ele detectar a mudança na segunda
      lastBossStatus["Mardil Fake"] = "DEAD"; 
    }
    // ==========================================
    // 🧪 FIM DO BLOCO DE TESTE TEMPORÁRIO
    // ==========================================

    // Varre todas as tabelas reais do site
    $("table").each((tableIndex, tableElement) => {
      $(tableElement).find("tr").each((index, element) => {
        if (index === 0) return; // Pula cabeçalho

        const cols = $(element).find("td");
        if (cols.length >= 3) {
          const bossName = $(cols[0]).text().trim();
          const bossStatus = $(cols[1]).text().trim();
          const respawnTime = cols[2] ? $(cols[2]).text().trim() : "
