const { SlashCommandBuilder } = require("discord.js");

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
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
];

module.exports = commands.map(c => c.toJSON());
