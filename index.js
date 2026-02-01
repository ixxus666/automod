
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

/* ================= CONFIG ================= */

const BAD_WORDS = ["nigga", "nigger"];
const LINK_REGEX = /(https?:\/\/[^\s]+)/gi;

// Spam
const SPAM_LIMIT = 5;
const SPAM_TIME = 5000;

// Anti-raid
const RAID_JOIN_LIMIT = 5;     // joins
const RAID_TIME = 10000;       // 10 seconds
const LOCKDOWN_TIME = 300000;  // 5 minutes

/* ========================================== */

const automodEnabled = new Map();
const antiRaidEnabled = new Map();
const spamMap = new Map();
const joinMap = new Map();
const lockedGuilds = new Set();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ========= SLASH COMMANDS ========= */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: "❌ You need **Manage Server** permission.",
      ephemeral: true
    });
  }

  // /automod
  if (interaction.commandName === "automod") {
    const sub = interaction.options.getSubcommand();

    if (sub === "on") {
      automodEnabled.set(interaction.guildId, true);
      return interaction.reply("✅ Automod **enabled**.");
    }

    if (sub === "off") {
      automodEnabled.set(interaction.guildId, false);
      return interaction.reply("❌ Automod **disabled**.");
    }

    if (sub === "status") {
      return interaction.reply(
        `📊 Automod is **${automodEnabled.get(interaction.guildId) ? "ON" : "OFF"}**`
      );
    }
  }

  // /antiraid
  if (interaction.commandName === "antiraid") {
    const sub = interaction.options.getSubcommand();

    if (sub === "on") {
      antiRaidEnabled.set(interaction.guildId, true);
      return interaction.reply("🚨 Anti-raid **enabled**.");
    }

    if (sub === "off") {
      antiRaidEnabled.set(interaction.guildId, false);
      return interaction.reply("❌ Anti-raid **disabled**.");
    }

    if (sub === "status") {
      return interaction.reply(
        `📊 Anti-raid is **${antiRaidEnabled.get(interaction.guildId) ? "ON" : "OFF"}**`
      );
    }
  }
});

/* ========= AUTOMOD ========= */

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!automodEnabled.get(message.guild.id)) return;

  const content = message.content.toLowerCase();

  // Bad words
  if (BAD_WORDS.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    return;
  }

  // Anti-link
  if (LINK_REGEX.test(message.content)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.delete().catch(() => {});
      return;
    }
  }

  // Anti-spam
  const now = Date.now();
  const data = spamMap.get(message.author.id) || { count: 0, last: now };

  if (now - data.last < SPAM_TIME) {
    data.count++;
    if (data.count >= SPAM_LIMIT) {
      await message.delete().catch(() => {});
      return;
    }
  } else {
    data.count = 1;
  }

  data.last = now;
  spamMap.set(message.author.id, data);
});

/* ========= ANTI RAID ========= */

client.on("guildMemberAdd", async (member) => {
  if (!antiRaidEnabled.get(member.guild.id)) return;

  const now = Date.now();
  const joins = joinMap.get(member.guild.id) || [];

  joins.push(now);
  joinMap.set(
    member.guild.id,
    joins.filter(t => now - t < RAID_TIME)
  );

  if (joinMap.get(member.guild.id).length >= RAID_JOIN_LIMIT) {
    if (lockedGuilds.has(member.guild.id)) {
      member.kick("Raid protection").catch(() => {});
      return;
    }

    lockedGuilds.add(member.guild.id);
    console.log(`🚨 RAID DETECTED in ${member.guild.name}`);

    // Lock server
    const everyone = member.guild.roles.everyone;
    member.guild.channels.cache.forEach(channel => {
      channel.permissionOverwrites.edit(everyone, {
        SendMessages: false
      }).catch(() => {});
    });

    member.kick("Raid protection").catch(() => {});

    // Auto unlock
    setTimeout(() => {
      member.guild.channels.cache.forEach(channel => {
        channel.permissionOverwrites.edit(everyone, {
          SendMessages: null
        }).catch(() => {});
      });

      lockedGuilds.delete(member.guild.id);
      joinMap.delete(member.guild.id);
      console.log(`🔓 Server unlocked: ${member.guild.name}`);
    }, LOCKDOWN_TIME);
  }
});

/* ========= LOGIN ========= */

client.login(process.env.TOKEN);
