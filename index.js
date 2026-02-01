require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// ===== CONFIG =====
const badWords = ["badword1", "badword2", "example"]; // add your words
const spamLimit = 5; // messages
const spamTime = 5000; // ms
const muteTime = 10 * 60 * 1000; // 10 minutes in ms
const logChannelId = process.env.LOG_CHANNEL_ID;

// ===== DATA TRACKERS =====
const spamMap = new Map();
const mutedUsers = new Map();

// ===== BOT READY =====
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const lower = message.content.toLowerCase();

    // --- BAD WORD FILTER ---
    for (const word of badWords) {
        if (lower.includes(word)) {
            await message.delete().catch(() => {});
            await warnUser(message, `Used a banned word: "${word}"`);
            return;
        }
    }

    // --- INVITE/LINK BLOCK ---
    const inviteRegex = /(discord\.gg\/|discordapp\.com\/invite\/)/i;
    const linkRegex = /(https?:\/\/[^\s]+)/i;

    if (inviteRegex.test(message.content)) {
        await message.delete().catch(() => {});
        await warnUser(message, "Posting Discord invites is not allowed!");
        return;
    }

    // Optional: block all links
    // if (linkRegex.test(message.content)) { ... }

    // --- MENTION SPAM ---
    const mentions = message.mentions.members.size;
    if (mentions >= 3 || message.mentions.everyone) {
        await message.delete().catch(() => {});
        await warnUser(message, "Do not spam mentions!");
        return;
    }

    // --- SPAM DETECTION ---
    handleSpam(message);
});

// ===== SPAM HANDLER =====
async function handleSpam(message) {
    const userId = message.author.id;
    const now = Date.now();

    if (!spamMap.has(userId)) spamMap.set(userId, []);
    const timestamps = spamMap.get(userId);

    timestamps.push(now);
    spamMap.set(userId, timestamps.filter(ts => now - ts < spamTime));

    if (spamMap.get(userId).length > spamLimit && !mutedUsers.has(userId)) {
        // Mute user
        const member = message.member;
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            try {
                const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === "muted");
                if (muteRole) await member.roles.add(muteRole);
                else console.log("Create a 'Muted' role for auto-mute to work.");

                mutedUsers.set(userId, Date.now() + muteTime);
                await message.channel.send(`${member} has been muted for spamming.`).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });

                logAction(message.guild.id, `${member.user.tag} muted for spamming`);
            } catch (err) {
                console.log(err);
            }
        }
    }
}

// ===== WARNING FUNCTION =====
async function warnUser(message, reason) {
    await message.channel.send(`${message.author}, ${reason}`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
    });
    logAction(message.guild.id, `${message.author.tag} warned: ${reason}`);
}

// ===== LOGGING FUNCTION =====
async function logAction(guildId, action) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const logChannel = guild.channels.cache.get(logChannelId);
        if (logChannel) logChannel.send(`📌 ${action}`);
    } catch (err) {
        console.log("Logging error:", err);
    }
}

// ===== UNMUTE HANDLER =====
setInterval(async () => {
    const now = Date.now();
    mutedUsers.forEach(async (endTime, userId) => {
        if (now >= endTime) {
            mutedUsers.delete(userId);
            client.guilds.cache.forEach(async guild => {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    const muteRole = guild.roles.cache.find(r => r.name.toLowerCase() === "muted");
                    if (muteRole && member.roles.cache.has(muteRole.id)) {
                        member.roles.remove(muteRole).catch(() => {});
                        logAction(guild.id, `${member.user.tag} has been unmuted automatically.`);
                    }
                }
            });
        }
    });
}, 5000);

client.login(process.env.TOKEN);
