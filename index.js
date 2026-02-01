const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Database } = require('sqlite3').verbose();
const db = new Database('./bot_data.db');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// Create tables for warnings and levels
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, warnings INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1)");
    db.run("CREATE TABLE IF NOT EXISTS config (guildId TEXT PRIMARY KEY, capsFilter INTEGER DEFAULT 1, scamFilter INTEGER DEFAULT 1)");
});

// --- Settings Command ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'config') {
        const setting = interaction.options.getString('setting');
        const state = interaction.options.getBoolean('state') ? 1 : 0;
        
        db.run("INSERT INTO config (guildId, [setting]) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET [setting]=?", 
            [interaction.guildId, state, state]);
            
        await interaction.reply(`Auto-mod **${setting}** has been updated to **${state ? 'ON' : 'OFF'}**.`);
    }

    if (interaction.commandName === 'rank') {
        db.get("SELECT xp, level FROM users WHERE id = ?", [interaction.user.id], (err, row) => {
            const xp = row ? row.xp : 0;
            const level = row ? row.level : 1;
            interaction.reply(`📊 **${interaction.user.username}** | Level: ${level} | XP: ${xp}`);
        });
    }
});

// --- Leveling & Auto-Mod Logic ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Leveling System (Add 15-25 XP per message)
    const xpToAdd = Math.floor(Math.random() * 10) + 15;
    db.run("INSERT INTO users (id, xp) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET xp = xp + ?", 
        [message.author.id, xpToAdd, xpToAdd]);

    // 2. Scam Detection (Auto-Mute/Timeout)
    const scams = ['free nitro', 'discord.gg/gift'];
    if (scams.some(s => message.content.toLowerCase().includes(s))) {
        await message.delete();
        await message.member.timeout(600000, "Scam link detected");
        message.channel.send(`🚫 ${message.author} has been timed out for scamming.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
