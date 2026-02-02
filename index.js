const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

/* ================= CONFIG ================= */
const BAD_WORDS = ["nigga", "nigger"];
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
/* ========================================== */

/* =============== STORAGE ================= */
const automodEnabled = new Map();
const features = new Map();
const spamMap = new Map();
const duplicateMap = new Map();
const warnings = new Map();
const antiRaidEnabled = new Map();
const joinMap = new Map();
const lockedGuilds = new Set();
/* ========================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

/* =============== HELPERS ================= */
async function dmUser(user, message) {
  try {
    await user.send(message);
  } catch {}
}

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
/* ========================================= */

/* =============== COMMANDS ================= */
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
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear warnings")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason")),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Anti-raid")
    .addSubcommand(sc => sc.setName("on").setDescription("Enable"))
    .addSubcommand(sc => sc.setName("off").setDescription("Disable"))
];

/* =============== READY ================= */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands.map(c => c.toJSON()) }
  );
  console.log("✅ Slash commands registered");
});

/* =============== INTERACTIONS ================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "❌ Manage Server required" });
  }

  const gid = interaction.guildId;
  const reply = content => interaction.reply({ content });

  /* WARN */
  if (interaction.commandName === "warn") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    const count = addWarning(gid, user.id);

    await dmUser(
      user,
      `⚠️ You were warned in **${interaction.guild.name}**\n📊 Warnings: ${count}\n📝 Reason: ${reason}`
    );

    return reply(`⚠️ ${user.tag} warned (**${count}**)`);
  }

  /* WARNINGS */
  if (interaction.commandName === "warnings") {
    const user = interaction.options.getUser("user");
    return reply(`📊 ${user.tag} has **${warnings.get(`${gid}:${user.id}`) || 0}** warnings`);
  }

  /* CLEAR WARNINGS */
  if (interaction.commandName === "clearwarnings") {
    const user = interaction.options.getUser("user");
    warnings.delete(`${gid}:${user.id}`);
    return reply(`🧹 Warnings cleared for ${user.tag}`);
  }

  /* TIMEOUT */
  if (interaction.commandName === "timeout") {
    const user = interaction.options.getUser("user");
    const minutes = interaction.options.getInteger("minutes");
    const reason = interaction.options.getString("reason") || "No reason";
    const member = await interaction.guild.members.fetch(user.id);

    await member.timeout(minutes * 60 * 1000, reason);

    await dmUser(
      user,
      `⏱ You were timed out in **${interaction.guild.name}**\n⏰ ${minutes} minutes\n📝 Reason: ${reason}`
    );

    return reply(`⏱ ${user.tag} timed out for ${minutes} minutes`);
  }

  /* KICK */
  if (interaction.commandName === "kick") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    await interaction.guild.members.kick(user.id, reason);
    return reply(`👢 ${user.tag} kicked`);
  }

  /* BAN */
  if (interaction.commandName === "ban") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason";
    await interaction.guild.members.ban(user.id, { reason });
    return reply(`🔨 ${user.tag} banned`);
  }

  /* ANTI RAID */
  if (interaction.commandName === "antiraid") {
    antiRaidEnabled.set(gid, interaction.options.getSubcommand() === "on");
    return reply(`🚨 Anti-raid updated`);
  }
});

/* =============== AUTOMOD ================= */
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!automodEnabled.get(msg.guild.id)) return;

  const f = getFeatures(msg.guild.id);
  const text = msg.content.toLowerCase();

  if (f.badwords && BAD_WORDS.some(w => text.includes(w))) {
    await msg.delete();
    addWarning(msg.guild.id, msg.author.id);
  }

  if (f.spam) {
    const now = Date.now();
    const times = spamMap.get(msg.author.id) || [];
    spamMap.set(msg.author.id, times.filter(t => now - t < SPAM_TIME).concat(now));
    if (spamMap.get(msg.author.id).length >= SPAM_LIMIT) {
      await msg.member.timeout(60000, "Spam");
      spamMap.delete(msg.author.id);
    }
  }
});

/* =============== LOGIN ================= */
client.login(process.env.TOKEN);
