const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

// ================= CONFIG =================
const BAD_WORDS = ["badword1", "badword2"];
const SPAM_LIMIT = 5;
const SPAM_TIME = 5000;
const DUPLICATE_LIMIT = 3;
const CAPS_PERCENT = 0.7;
const CAPS_MIN = 8;
const MENTION_LIMIT = 5;
const EMOJI_LIMIT = 6;
const MIN_ACCOUNT_AGE = 30; // minutes
const RAID_JOIN_LIMIT = 5;
const RAID_TIME = 10000;
const LOCKDOWN_TIME = 300000;

// ==========================================

// Automod & feature toggles
const automodEnabled = new Map();
const features = new Map();
const spamMap = new Map();
const duplicateMap = new Map();
const warnings = new Map();
const joinMap = new Map();
const lockedGuilds = new Set();

// =============== CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// =============== COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Automod settings")
    .addSubcommand(sc => sc.setName("on").setDescription("Enable automod"))
    .addSubcommand(sc => sc.setName("off").setDescription("Disable automod"))
    .addSubcommand(sc =>
      sc.setName("toggle")
        .setDescription("Toggle a feature")
        .addStringOption(o =>
          o.setName("feature")
            .setDescription("Feature name")
            .setRequired(true)
            .addChoices(
              { name: "badwords", value: "badwords" },
              { name: "links", value: "links" },
              { name: "invites", value: "invites" },
              { name: "caps", value: "caps" },
              { name: "mentions", value: "mentions" },
              { name: "emojis", value: "emojis" },
              { name: "spam", value: "spam" },
              { name: "duplicates", value: "duplicates" }
            )
        )
    ),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check warnings")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear warnings")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Enable/disable anti-raid")
    .addSubcommand(sc => sc.setName("on").setDescription("Enable anti-raid"))
    .addSubcommand(sc => sc.setName("off").setDescription("Disable anti-raid"))
];

// =============== HELPERS =================
function getFeatures(gid) {
  if (!features.has(gid)) {
    features.set(gid, {
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
  return features.get(gid);
}

function addWarning(gid, uid) {
  const key = `${gid}:${uid}`;
  warnings.set(key, (warnings.get(key) || 0) + 1);
  return warnings.get(key);
}

// =============== REGISTER COMMANDS ON STARTUP =================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log("✅ Slash commands registered (guild).");
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }
});

// =============== INTERACTION HANDLER =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "❌ Manage Server required.", ephemeral: true });
  }

  const gid = interaction.guildId;
  const f = getFeatures(gid);

  // Automod commands
  if (interaction.commandName === "automod") {
    const sub = interaction.options.getSubcommand();
    if (sub === "on") {
      automodEnabled.set(gid, true);
      return interaction.reply("🤖 Automod enabled.");
    }
    if (sub === "off") {
      automodEnabled.set(gid, false);
      return interaction.reply("🤖 Automod disabled.");
    }
    if (sub === "toggle") {
      const feature = interaction.options.getString("feature");
      f[feature] = !f[feature];
      return interaction.reply(`🎛 Feature **${feature}** is now **${f[feature] ? "ON" : "OFF"}**`);
    }
  }

  // Warnings
  if (interaction.commandName === "warn") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const count = addWarning(gid, user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      if (count === 3) member.timeout(10 * 60 * 1000, "3 warnings").catch(() => {});
      if (count >= 5) member.kick("5 warnings").catch(() => {});
    }
    return interaction.reply(`⚠️ ${user.tag} warned (**${count}** total)\n📝 ${reason}`);
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

  // Anti-raid
  if (interaction.commandName === "antiraid") {
    const sub = interaction.options.getSubcommand();
    antiRaidEnabled.set(gid, sub === "on");
    return interaction.reply(`🚨 Anti-raid **${sub === "on" ? "enabled" : "disabled"}**.`);
  }
});

// =============== AUTOMOD =================
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
    if (letters.length >= CAPS_MIN &&
        letters.replace(/[^A-Z]/g, "").length / letters.length >= CAPS_PERCENT) {
      await message.delete().catch(() => {});
      addWarning(message.guild.id, message.author.id);
      return;
    }
  }

  if (f.mentions && (message.mentions.users.size + message.mentions.roles.size) >= MENTION_LIMIT) {
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

// =============== ANTI-RAID =================
const antiRaidEnabled = new Map();
client.on("guildMemberAdd", async (member) => {
  const gid = member.guild.id;
  if (!antiRaidEnabled.get(gid)) return;

  const ageMinutes = (Date.now() - member.user.createdTimestamp) / 60000;
  if (ageMinutes < MIN_ACCOUNT_AGE) {
    return member.timeout(10 * 60 * 1000, "New account").catch(() => {});
  }

  const now = Date.now();
  const joins = joinMap.get(gid) || [];
  joins.push(now);
  joinMap.set(gid, joins.filter(t => now - t < RAID_TIME));

  if (joinMap.get(gid).length >= RAID_JOIN_LIMIT) {
    if (lockedGuilds.has(gid)) {
      member.kick("Raid protection").catch(() => {});
      return;
    }
    lockedGuilds.add(gid);
    const everyone = member.guild.roles.everyone;
    member.guild.channels.cache.forEach(c =>
      c.permissionOverwrites.edit(everyone, { SendMessages: false }).catch(() => {})
    );
    member.kick("Raid protection").catch(() => {});
    setTimeout(() => {
      member.guild.channels.cache.forEach(c =>
        c.permissionOverwrites.edit(everyone, { SendMessages: null }).catch(() => {})
      );
      lockedGuilds.delete(gid);
      joinMap.delete(gid);
    }, LOCKDOWN_TIME);
  }
});

// =============== LOGIN =================
client.login(process.env.TOKEN);
