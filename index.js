const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

/* =============== CONFIG =============== */

const BAD_WORDS = ["badword1", "badword2"];
const SPAM_LIMIT = 5;
const SPAM_TIME = 5000;
const DUPLICATE_LIMIT = 3;
const CAPS_PERCENT = 0.7;
const CAPS_MIN = 8;
const MENTION_LIMIT = 5;
const EMOJI_LIMIT = 6;

/* ===================================== */

const automodEnabled = new Map();
const features = new Map(); // per guild
const spamMap = new Map();
const duplicateMap = new Map();
const warnings = new Map();

/* =============== READY =============== */

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ========== HELPERS ========== */

function getFeatures(guildId) {
  if (!features.has(guildId)) {
    features.set(guildId, {
      badwords: true,
      links: true,
      invites: true,
      caps: true,
      mentions: true,
      emojis: true,
      spam: true,
      duplicates: true
    });
  }
  return features.get(guildId);
}

function addWarning(guildId, userId) {
  const key = `${guildId}:${userId}`;
  warnings.set(key, (warnings.get(key) || 0) + 1);
  return warnings.get(key);
}

/* ========== SLASH COMMANDS ========== */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "❌ Manage Server required.", ephemeral: true });
  }

  const gid = interaction.guildId;

  if (interaction.commandName === "automod") {
    const sub = interaction.options.getSubcommand();

    if (sub === "on") {
      automodEnabled.set(gid, true);
      return interaction.reply("🤖 Automod **enabled**.");
    }

    if (sub === "off") {
      automodEnabled.set(gid, false);
      return interaction.reply("🤖 Automod **disabled**.");
    }

    if (sub === "toggle") {
      const feature = interaction.options.getString("feature");
      const f = getFeatures(gid);
      f[feature] = !f[feature];
      return interaction.reply(
        `🎛 **${feature}** is now **${f[feature] ? "ON" : "OFF"}**`
      );
    }
  }

  if (interaction.commandName === "warn") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";

    const count = addWarning(gid, user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (member) {
      if (count === 3) {
        member.timeout(10 * 60 * 1000, "3 warnings").catch(() => {});
      }
      if (count >= 5) {
        member.kick("5 warnings").catch(() => {});
      }
    }

    return interaction.reply(
      `⚠️ ${user.tag} warned (**${count}** total)\n📝 ${reason}`
    );
  }

  if (interaction.commandName === "warnings") {
    const user = interaction.options.getUser("user");
    const count = warnings.get(`${gid}:${user.id}`) || 0;
    return interaction.reply(`📊 ${user.tag} has **${count}** warning(s).`);
  }

  if (interaction.commandName === "clearwarnings") {
    const user = interaction.options.getUser("user");
    warnings.delete(`${gid}:${user.id}`);
    return interaction.reply(`🧹 Cleared warnings for ${user.tag}.`);
  }
});

/* =============== AUTOMOD =============== */

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!automodEnabled.get(message.guild.id)) return;
  if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

  const f = getFeatures(message.guild.id);
  const content = message.content;

  if (f.badwords && BAD_WORDS.some(w => content.toLowerCase().includes(w))) {
    await message.delete().catch(() => {});
    addWarning(message.guild.id, message.author.id);
    return;
  }

  if (f.links && /https?:\/\//i.test(content)) {
    await message.delete().catch(() => {});
    addWarning(message.guild.id, message.author.id);
    return;
  }

  if (f.invites && /discord\.gg/i.test(content)) {
    await message.delete().catch(() => {});
    addWarning(message.guild.id, message.author.id);
    return;
  }

  if (f.caps) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (
      letters.length >= CAPS_MIN &&
      letters.replace(/[^A-Z]/g, "").length / letters.length >= CAPS_PERCENT
    ) {
      await message.delete().catch(() => {});
      addWarning(message.guild.id, message.author.id);
      return;
    }
  }

  if (f.mentions &&
    message.mentions.users.size + message.mentions.roles.size >= MENTION_LIMIT) {
    await message.delete().catch(() => {});
    addWarning(message.guild.id, message.author.id);
    return;
  }

  if (f.emojis) {
    const emojis = (content.match(/<a?:\w+:\d+>/g) || []).length;
    if (emojis >= EMOJI_LIMIT) {
      await message.delete().catch(() => {});
      addWarning(message.guild.id, message.author.id);
      return;
    }
  }

  if (f.spam) {
    const now = Date.now();
    const data = spamMap.get(message.author.id) || { count: 0, last: now };
    if (now - data.last < SPAM_TIME) {
      data.count++;
      if (data.count >= SPAM_LIMIT) {
        await message.delete().catch(() => {});
        message.member.timeout(60_000, "Spam").catch(() => {});
        return;
      }
    } else data.count = 1;
    data.last = now;
    spamMap.set(message.author.id, data);
  }

  if (f.duplicates) {
    const dup = duplicateMap.get(message.author.id) || { text: "", count: 0 };
    if (dup.text === content) {
      dup.count++;
      if (dup.count >= DUPLICATE_LIMIT) {
        await message.delete().catch(() => {});
        return;
      }
    } else {
      dup.text = content;
      dup.count = 1;
    }
    duplicateMap.set(message.author.id, dup);
  }
});

/* =============== LOGIN =============== */

client.login(process.env.TOKEN);
