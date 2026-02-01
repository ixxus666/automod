const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");
const fetch = require("node-fetch"); // for meme command

// ================= CONFIG =================
const BAD_WORDS = ["nigga", "nigger","nga"];
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
const DEFAULT_WARN_LIMIT = 5;

// ==========================================

// ================= DATA STRUCTURES =================
const automodEnabled = new Map();
const features = new Map();
const spamMap = new Map();
const duplicateMap = new Map();
const warnings = new Map();
const joinMap = new Map();
const lockedGuilds = new Set();
const antiRaidEnabled = new Map();
const mutedUsers = new Map(); // for mute command
const warnLimit = new Map(); // per guild warn limit

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

function getWarnLimit(gid) {
  return warnLimit.get(gid) || DEFAULT_WARN_LIMIT;
}

function isPublic(command) {
  return ["timeout", "warnings", "kick", "ban", "userinfo", "serverinfo"].includes(command);
}

// ================= COMMANDS =================
const commands = [
  // AUTOMOD
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
    .setName("setwarnlimit")
    .setDescription("Set warnings before punish")
    .addIntegerOption(o => o.setName("amount").setDescription("Number of warnings").setRequired(true)),
  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Enable/disable anti-raid")
    .addSubcommand(sc => sc.setName("on").setDescription("Enable anti-raid"))
    .addSubcommand(sc => sc.setName("off").setDescription("Disable anti-raid")),
  
  // MODERATION
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
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a user")
    .addUserOption(o => o.setName("user").setDescription("User to mute").setRequired(true)),
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a user")
    .addUserOption(o => o.setName("user").setDescription("User to unmute").setRequired(true)),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete multiple messages")
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages").setRequired(true)),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel"),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel"),
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption(o => o.setName("seconds").setDescription("Seconds per message").setRequired(true)),

  // UTILITY
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show user info")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server info"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Bot latency"),
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show user's avatar")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(false)),
  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add/Remove role")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)),

  // FUN
  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a dice"),
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin"),
  new SlashCommandBuilder()
    .setName("meme")
    .setDescription("Get a random meme")
];

// ================= REGISTER COMMANDS =================
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

// ================= INTERACTION HANDLER =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const gid = interaction.guildId;
  const f = getFeatures(gid);
  const ephemeral = !isPublic(interaction.commandName);

  const reply = (content, forceEphemeral = ephemeral) => interaction.reply({ content, ephemeral: forceEphemeral });

  // ===== Automod Commands =====
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

  // ===== Warnings =====
  if (interaction.commandName === "warn") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const count = addWarning(gid, user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      if (count === 3) member.timeout(10 * 60 * 1000, "3 warnings").catch(() => {});
      if (count >= getWarnLimit(gid)) member.kick(`${count} warnings`).catch(() => {});
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

  if (interaction.commandName === "setwarnlimit") {
    const amount = interaction.options.getInteger("amount");
    warnLimit.set(gid, amount);
    return reply(`⚠️ Warn limit set to ${amount}`);
  }

  // ===== Anti-Raid =====
  if (interaction.commandName === "antiraid") {
    const sub = interaction.options.getSubcommand();
    antiRaidEnabled.set(gid, sub === "on");
    return reply(`🚨 Anti-raid **${sub === "on" ? "enabled" : "disabled"}**`);
  }

  // ===== Moderation =====
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
      return reply(`⏱ ${user.tag} timed out for ${minutes} min\n📝 Reason: ${reason}`, false);
    } catch (err) {
      return reply(`❌ Failed: ${err.message}`, false);
    }
  }

  if (interaction.commandName === "kick") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return reply("❌ Cannot kick a moderator/admin.", false);
    try {
      await member.kick(reason);
      return reply(`👢 ${user.tag} kicked.\n📝 Reason: ${reason}`, false);
    } catch (err) {
      return reply(`❌ Failed: ${err.message}`, false);
    }
  }

  if (interaction.commandName === "ban") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return reply("❌ Cannot ban a moderator/admin.", false);
    try {
      await member.ban({ reason });
      return reply(`🔨 ${user.tag} banned.\n📝 Reason: ${reason}`, false);
    } catch (err) {
      return reply(`❌ Failed: ${err.message}`, false);
    }
  }

  if (interaction.commandName === "mute") {
    const user = interaction.options.getUser("user");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    const muteRole = interaction.guild.roles.cache.find(r => r.name === "Muted");
    if (!muteRole) return reply("❌ No 'Muted' role found.", false);
    await member.roles.add(muteRole).catch(() => {});
    mutedUsers.set(`${gid}:${user.id}`, true);
    return reply(`🔇 ${user.tag} muted`, false);
  }

  if (interaction.commandName === "unmute") {
    const user = interaction.options.getUser("user");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    const muteRole = interaction.guild.roles.cache.find(r => r.name === "Muted");
    if (!muteRole) return reply("❌ No 'Muted' role found.", false);
    await member.roles.remove(muteRole).catch(() => {});
    mutedUsers.delete(`${gid}:${user.id}`);
    return reply(`🔊 ${user.tag} unmuted`, false);
  }

  if (interaction.commandName === "purge") {
    const amount = interaction.options.getInteger("amount");
    const messages = await interaction.channel.messages.fetch({ limit: amount }).catch(() => null);
    if (!messages) return reply("❌ Cannot fetch messages.", false);
    await interaction.channel.bulkDelete(messages, true).catch(() => {});
    return reply(`🧹 Deleted ${messages.size} messages.`, false);
  }

  if (interaction.commandName === "lock") {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    return reply("🔒 Channel locked", false);
  }

  if (interaction.commandName === "unlock") {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
    return reply("🔓 Channel unlocked", false);
  }

  if (interaction.commandName === "slowmode") {
    const seconds = interaction.options.getInteger("seconds");
    await interaction.channel.setRateLimitPerUser(seconds);
    return reply(`🐢 Slowmode set to ${seconds} seconds`, false);
  }

  // ===== Utility =====
  if (interaction.commandName === "userinfo") {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", false);
    const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.name).join(", ") || "None";
    return reply(`👤 **${user.tag}**\n🆔 ID: ${user.id}\n📅 Joined: ${member.joinedAt.toDateString()}\n📝 Roles: ${roles}\n⚠️ Warnings: ${warnings.get(`${gid}:${user.id}`) || 0}`, false);
  }

  if (interaction.commandName === "serverinfo") {
    const guild = interaction.guild;
    return reply(`🏰 **${guild.name}**\n🆔 ID: ${guild.id}\n👥 Members: ${guild.memberCount}\n🌟 Boost Level: ${guild.premiumTier}`, false);
  }

  if (interaction.commandName === "ping") {
    return reply(`🏓 Pong! Latency: ${client.ws.ping}ms`, ephemeral);
  }

  if (interaction.commandName === "avatar") {
    const user = interaction.options.getUser("user") || interaction.user;
    return reply(`${user.tag}'s avatar: ${user.displayAvatarURL({ dynamic: true, size: 1024 })}`, ephemeral);
  }

  if (interaction.commandName === "role") {
    const user = interaction.options.getUser("user");
    const role = interaction.options.getRole("role");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return reply("❌ User not found.", ephemeral);
    if (member.roles.cache.has
