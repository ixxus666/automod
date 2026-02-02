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
const BAD_WORDS = ["daddy", "nigger", "nigga", "nga"];
const SPAM_LIMIT = 5;
const SPAM_TIME = 10000; // 10 seconds
const DUPLICATE_LIMIT = 3;
const CAPS_PERCENT = 0.7;
const CAPS_MIN = 8;
const MENTION_LIMIT = 5;
const EMOJI_LIMIT = 6;
const MIN_ACCOUNT_AGE = 30; // minutes
const RAID_JOIN_LIMIT = 5;
const RAID_TIME = 10000;
const LOCKDOWN_TIME = 300000; // 5 minutes

// ==========================================

// Automod & feature toggles
const automodEnabled = new Map();
const features = new Map();
const spamMap = new Map();
const duplicateMap = new Map();
const warnings = new Map();
const joinMap = new Map();
const lockedGuilds = new Set();
const antiRaidEnabled = new Map();

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
    .addSubcommand(sc => sc.setName("off").setDescription("Disable anti-raid")),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption(o => o.setName("user").setDescription("User to timeout").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason"))
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

// =============== REGISTER COMMANDS =================
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
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const gid = interaction.guildId;
  const f = getFeatures(gid);

  // Default ephemeral unless one of these commands
  const publicCommands = ["timeout", "warnings", "kick", "ban"];
  const ephemeral = !publicCommands.includes(interaction.commandName);

  // Check Manage Server permission for all except public commands
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "❌ Manage Server required.", ephemeral: true });
  }

  const reply = (content, forceEphemeral = ephemeral) => interaction.reply({ content, ephemeral: forceEphemeral });

  // ---------------- AUTOMOD ----------------
  if (interaction.commandName === "automod") {
    const sub = interaction.options.getSubcommand();
    if (sub === "on") automodEnabled.set(gid, true), reply("🤖 Automod enabled");
    if (sub === "off") automodEnabled.set(gid, false), reply("🤖 Automod disabled");
    if (sub === "toggle") {
      const feature = interaction.options.getString("feature");
      f[feature] = !f[feature];
      return reply(`🎛 Feature **${feature}** is now **${f[feature] ? "ON" : "OFF"}**`);
    }
    return;
  }

  // ---------------- WARNINGS ----------------
  if (interaction.commandName === "warn") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const count = addWarning(gid, user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      if (count === 3) member.timeout(10 * 60 * 1000, "3 warnings").catch(() => {});
      if (count >= 5) member.kick("5 warnings").catch(() => {});
    }
    return reply(`⚠️ ${user.tag} warned (**${count}** total)\n📝 Reason: ${reason}`);
  }

  if (interaction.commandName === "warnings") {
    const user = interaction.options.getUser("user");
    const count = warnings.get(`${gid}:${user.id}`) || 0;
    return reply(`📊 ${user.tag} has **${count}** warning(s).`, false);
  }

  if (interaction.commandName === "clearwarnings") {
    const user = interaction.options.getUser("user");
    warnings.delete(`${gid}:${user.id}`);
    return reply(`🧹 Cleared warnings for ${user.tag}`);
  }

  // ---------------- ANTI-RAID ----------------
  if (interaction.commandName === "antiraid") {
    const sub = interaction.options.getSubcommand();
    antiRaidEnabled.set(gid, sub === "on");
    return reply(`🚨 Anti-raid **${sub === "on" ? "enabled" : "disabled"}**`);
  }

  // ---------------- TIMEOUT ----------------
  if (interaction.commandName === "timeout") {
    const user = interaction.options.getUser("user");
    const minutes = interaction.options.getInteger("minutes");
    const reason = interaction.options.getString("reason") || "No reason";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return reply("❌ Cannot timeout a moderator/admin.", false);

    try {
      await member.timeout(minutes * 60 * 1000, reason);
      return reply(`⏱ ${user.tag} has been timed out for ${minutes} minute(s).\n📝 Reason: ${reason}`, false);
    } catch (err) {
      console.error("Timeout failed:", err);
      return reply(`❌ Failed to timeout user. ${err.message}`, false);
    }
  }

  // ---------------- KICK ----------------
  if (interaction.commandName === "kick") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return reply("❌ Cannot kick a moderator/admin.", false);

    try {
      await member.kick(reason);
      return reply(`👢 ${user.tag} has been kicked.\n📝 Reason: ${reason}`, false);
    } catch (err) {
      console.error("Kick failed:", err);
      return reply(`❌ Failed to kick user. ${err.message}`, false);
    }
  }

  // ---------------- BAN ----------------
  if (interaction.commandName === "ban") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return reply("❌ Cannot ban a moderator/admin.", false);

    try {
      await member.ban({ reason });
      return reply(`🔨 ${user.tag} has been banned.\n📝 Reason: ${reason}`, false);
    } catch (err) {
      console.error("Ban failed:", err);
      return reply(`❌ Failed to ban user. ${err.message}`, false);
    }
  }
});

// =============== AUTOMOD =================
client.on("messageCreate", async message => {
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
    const data = spamMap.get(message.author.id) || { count: 0, first: now };
    if (now - data.first > SPAM_TIME) {
      data.count = 1;
      data.first = now;
    } else data.count++;
    spamMap.set(message.author.id, data);
    if (data.count >= SPAM_LIMIT) {
      await message.delete().catch(() => {});
      message.member.timeout(60_000, "Spam").catch(() => {});
      spamMap.delete(message.author.id);
      return;
    }
  }

  if (f.duplicates) {
    const dup = duplicateMap.get(message.author.id) || { text: "", count: 0 };
    if (dup.text === content) {
      dup.count++;
      if (dup.count >= DUPLICATE_LIMIT) {
        await message.delete().catch(() => {});
        duplicateMap.delete(message.author.id);
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
client.on("guildMemberAdd", async member => {
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
