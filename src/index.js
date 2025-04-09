require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

let previousLevels = {};
const sentKills = new Set();
const MAX_KILLS = 30;

const GUILD_URL = process.env.GUILD_URL;
const DEATHS_URL = 'https://www.ntoultimate.com.br/deaths.php';
const CHANNEL_ID = process.env.CHANNEL_ID;

// Função para limitar o tamanho do Set
function addKillId(id) {
    sentKills.add(id);
    if (sentKills.size > MAX_KILLS) {
        const first = sentKills.values().next().value;
        sentKills.delete(first);
    }
}

async function fetchGuildLevels() {
    const { data: html } = await axios.get(GUILD_URL);
    const $ = cheerio.load(html);
    const levels = {};

    $('#guildViewTable tr.tr-border').each((_, tr) => {
        const tds = $(tr).find('td');
        const name = $(tds[1]).text().trim();
        const level = parseInt($(tds[2]).text().trim());
        levels[name] = level;
    });

    return levels;
}

async function fetchRecentDeaths() {
    const { data: html } = await axios.get(DEATHS_URL);
    const $ = cheerio.load(html);
    const deaths = [];

    $('#deathsTable tr').each((i, row) => {
        if (i === 0) return; // pula o header

        const tds = $(row).find('td');
        const victimRaw = $(tds[0]).text().trim();
        const date = $(tds[1]).text().trim();
        const killerRaw = $(tds[2]).text().trim();

        const victimMatch = victimRaw.match(/:\s(.+?)$/);
        const killerMatch = killerRaw.match(/:\s(.+?)$/);

        if (!victimMatch || !killerMatch) return;

        const victim = victimMatch[1];
        const killer = killerMatch[1];

        deaths.push({ victim, killer, date });
    });

    return deaths;
}

client.once('ready', async () => {
    console.log(`🤖 Bot logado como ${client.user.tag}`);

    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        channel.send('✅ Bot está online!');

        previousLevels = await fetchGuildLevels();
        console.log('📦 Níveis iniciais carregados:', previousLevels);
    } catch (error) {
        console.error('❌ Erro ao iniciar o bot ou buscar canal:', error);
    }

    // Checagem de level a cada 10s
    setInterval(async () => {
        try {
            const currentLevels = await fetchGuildLevels();
            const changes = [];

            for (const name in currentLevels) {
                const current = currentLevels[name];
                const previous = previousLevels[name];

                if (previous !== undefined && current > previous) {
                    changes.push({ name, from: previous, to: current });
                }
            }

            previousLevels = currentLevels;

            if (changes.length > 0) {
                const channel = await client.channels.fetch(CHANNEL_ID);
                for (const change of changes) {
                    channel.send(`📈 ${change.name} subiu de level! (${change.from} → ${change.to})`);
                }
            }
        } catch (error) {
            console.error('❌ Erro ao buscar ou processar níveis:', error);
        }
    }, 10 * 1000);

    // Checagem de assassinatos a cada 30s
    setInterval(async () => {
        try {
            const deaths = await fetchRecentDeaths();
            const channel = await client.channels.fetch(CHANNEL_ID);

            for (const death of deaths) {
                const { victim, killer, date } = death;
                if (previousLevels.hasOwnProperty(killer)) {
                    const uniqueId = `${killer}-${victim}-${date}`;
                    if (!sentKills.has(uniqueId)) {
                        channel.send(`☠️ ${killer} matou ${victim} 15min de PZ`);
                        addKillId(uniqueId);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Erro ao verificar mortes:', error);
        }
    }, 30 * 1000); // a cada 30 segundos
});

client.login(process.env.DISCORD_TOKEN);
