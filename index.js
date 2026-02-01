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
const BAD_WORDS = ["badword1","badword2"];
const SPAM_LIMIT = 5;
const SPAM_TIME = 10000;
const DUPLICATE_LIMIT = 3;
const CAPS_PERCENT = 0.7;
const CAPS_MIN = 8;
const MENTION_LIMIT = 5;
const EMOJI_LIMIT = 6;
const MIN_ACCOUNT_AGE = 30;
const RAID_JOIN_LIMIT = 5;
const RAID_TIME = 10000;
const LOCKDOWN_TIME = 300000;
const DEFAULT_WARN_LIMIT = 5;

// ================= DATA STRUCTURES =================
const automodEnabled = new Map();
const features = new Map();
const spamMap = new Map();
const duplicateMap = new Map();
const warnings = new Map();
const joinMap = new Map();
const lockedGuilds = new Set();
const antiRaidEnabled = new Map();
const mutedUsers = new Map();
const warnLimit = new Map();

// ================= CLIENT =================
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials:[Partials.Channel]
});

// ================= HELPERS =================
function getFeatures(gid){
  if(!features.has(gid)){
    features.set(gid,{
      badwords:true,
      links:true,
      invites:true,
      caps:true,
      mentions:true,
      emojis:true,
      spam:true,
      duplicates:true
    });
  }
  return features.get(gid);
}

function addWarning(gid, uid){
  const key = `${gid}:${uid}`;
  warnings.set(key,(warnings.get(key)||0)+1);
  return warnings.get(key);
}

function getWarnLimit(gid){
  return warnLimit.get(gid)||DEFAULT_WARN_LIMIT;
}

function isPublic(command){
  return ["timeout","warnings","kick","ban"].includes(command);
}

// ================= COMMANDS =================
const commands=[
  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Automod settings")
    .addSubcommand(sc=>sc.setName("on").setDescription("Enable automod"))
    .addSubcommand(sc=>sc.setName("off").setDescription("Disable automod"))
    .addSubcommand(sc=>sc.setName("toggle").setDescription("Toggle a feature")
      .addStringOption(o=>o.setName("feature").setDescription("Feature name").setRequired(true)
        .addChoices(
          {name:"badwords",value:"badwords"},
          {name:"links",value:"links"},
          {name:"invites",value:"invites"},
          {name:"caps",value:"caps"},
          {name:"mentions",value:"mentions"},
          {name:"emojis",value:"emojis"},
          {name:"spam",value:"spam"},
          {name:"duplicates",value:"duplicates"}
        )
      )
    ),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Check warnings")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear warnings")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setwarnlimit")
    .setDescription("Set warnings before punish")
    .addIntegerOption(o=>o.setName("amount").setDescription("Number of warnings").setRequired(true)),
  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Enable/disable anti-raid")
    .addSubcommand(sc=>sc.setName("on").setDescription("Enable anti-raid"))
    .addSubcommand(sc=>sc.setName("off").setDescription("Disable anti-raid")),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption(o=>o.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption(o=>o.setName("minutes").setDescription("Duration in minutes").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .addUserOption(o=>o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption(o=>o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption(o=>o.setName("reason").setDescription("Reason"))
];

// ================= REGISTER COMMANDS =================
client.once("ready",async()=>{
  console.log(`✅ Logged in as ${client.user.tag}`);
  try{
    const rest = new REST({version:"10"}).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),
      {body:commands.map(c=>c.toJSON())}
    );
    console.log("✅ Slash commands registered.");
  }catch(err){
    console.error("❌ Failed to register commands:",err);
  }
});

// ================= INTERACTION HANDLER =================
client.on("interactionCreate",async interaction=>{
  if(!interaction.isChatInputCommand()) return;
  const gid = interaction.guildId;
  const ephemeral = !isPublic(interaction.commandName);
  const reply = (content,force=ephemeral)=>interaction.reply({content,ephemeral:force});

  try{
    // === AUTOMOD ===
    if(interaction.commandName==="automod"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return reply("❌ Manage Server required.");
      const sub = interaction.options.getSubcommand();
      const f = getFeatures(gid);
      if(sub==="on") automodEnabled.set(gid,true),reply("🤖 Automod enabled.");
      else if(sub==="off") automodEnabled.set(gid,false),reply("🤖 Automod disabled.");
      else if(sub==="toggle"){
        const feature = interaction.options.getString("feature");
        f[feature]=!f[feature];
        reply(`🎛 Feature **${feature}** is now **${f[feature]?"ON":"OFF"}**`);
      }
    }

    // === WARNINGS ===
    if(interaction.commandName==="warn"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return reply("❌ Kick Members required.");
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason")||"No reason";
      const count = addWarning(gid,user.id);
      const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
      if(member){
        if(count===3) member.timeout(10*60*1000,"3 warnings").catch(()=>{});
        if(count>=getWarnLimit(gid)) member.kick("Warn limit reached").catch(()=>{});
      }
      return reply(`⚠️ ${user.tag} warned (**${count}** total)\n📝 ${reason}`);
    }

    if(interaction.commandName==="warnings"){
      const user = interaction.options.getUser("user");
      const count = warnings.get(`${gid}:${user.id}`)||0;
      return reply(`📊 ${user.tag} has **${count}** warning(s).`);
    }

    if(interaction.commandName==="clearwarnings"){
      const user = interaction.options.getUser("user");
      warnings.delete(`${gid}:${user.id}`);
      return reply(`🧹 Cleared warnings for ${user.tag}.`);
    }

    if(interaction.commandName==="setwarnlimit"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return reply("❌ Manage Server required.");
      const amount = interaction.options.getInteger("amount");
      warnLimit.set(gid,amount);
      return reply(`⚠️ Warning limit set to ${amount}`);
    }

    // === ANTI-RAID ===
    if(interaction.commandName==="antiraid"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return reply("❌ Manage Server required.");
      const sub = interaction.options.getSubcommand();
      antiRaidEnabled.set(gid,sub==="on");
      return reply(`🚨 Anti-raid **${sub==="on"?"enabled":"disabled"}**`);
    }

    // === TIMEOUT ===
    if(interaction.commandName==="timeout"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
        return reply("❌ Timeout Members required.");
      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason")||"No reason";
      let member;
      try{ member = await interaction.guild.members.fetch(user.id); }catch{ return reply("❌ User not found."); }
      await interaction.deferReply({ephemeral:true});
      try{
        await member.timeout(minutes*60*1000,reason);
        await interaction.editReply(`✅ ${user.tag} has been timed out for **${minutes} minute(s)**.`);
      }catch(err){
        await interaction.editReply("❌ Failed to timeout user. Make sure my role is above them and I have permission.");
      }
    }

    // === KICK ===
    if(interaction.commandName==="kick"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return reply("❌ Kick Members required.");
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason")||"No reason";
      let member;
      try{ member = await interaction.guild.members.fetch(user.id); }catch{ return reply("❌ User not found."); }
      await interaction.deferReply({ephemeral:true});
      try{
        await member.kick(reason);
        await interaction.editReply(`✅ ${user.tag} has been kicked.`);
      }catch(err){
        await interaction.editReply("❌ Failed to kick user. Make sure my role is above them and I have permission.");
      }
    }

    // === BAN ===
    if(interaction.commandName==="ban"){
      if(!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return reply("❌ Ban Members required.");
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason")||"No reason";
      let member;
      try{ member = await interaction.guild.members.fetch(user.id); }catch{ return reply("❌ User not found."); }
      await interaction.deferReply({ephemeral:true});
      try{
        await member.ban({reason});
        await interaction.editReply(`✅ ${user.tag} has been banned.`);
      }catch(err){
        await interaction.editReply("❌ Failed to ban user. Make sure my role is above them and I have permission.");
      }
    }

  }catch(err){
    console.error(err);
    if(!interaction.replied) interaction.reply({content:"❌ An error occurred.",ephemeral:true});
  }
});

// ================= AUTOMOD =================
client.on("messageCreate",async message=>{
  if(!message.guild||message.author.bot) return;
  if(!automodEnabled.get(message.guild.id)) return;
  if(message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

  const f = getFeatures(message.guild.id);
  const content = message.content.toLowerCase();

  if(f.badwords && BAD_WORDS.some(w=>content.includes(w))){
    await message.delete().catch(()=>{});
    addWarning(message.guild.id,message.author.id);
    return;
  }
});

// ================= ANTI-RAID =================
client.on("guildMemberAdd",async member=>{
  const gid = member.guild.id;
  if(!antiRaidEnabled.get(gid)) return;

  const ageMinutes = (Date.now() - member.user.createdTimestamp)/60000;
  if(ageMinutes<MIN_ACCOUNT_AGE) return member.timeout(10*60*1000,"New account").catch(()=>{});

  const now = Date.now();
  const joins = joinMap.get(gid)||[];
  joins.push(now);
  joinMap.set(gid,joins.filter(t=>now-t<RAID_TIME));

  if(joinMap.get(gid).length>=RAID_JOIN_LIMIT){
    if(lockedGuilds.has(gid)){
      member.kick("Raid protection").catch(()=>{});
      return;
    }
    lockedGuilds.add(gid);
    const everyone = member.guild.roles.everyone;
    member.guild.channels.cache.forEach(c=>c.permissionOverwrites.edit(everyone,{SendMessages:false}).catch(()=>{}));
    member.kick("Raid protection").catch(()=>{});
    setTimeout(()=>{
      member.guild.channels.cache.forEach(c=>c.permissionOverwrites.edit(everyone,{SendMessages:null}).catch(()=>{}));
      lockedGuilds.delete(gid);
      joinMap.delete(gid);
    },LOCKDOWN_TIME);
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
