const { REST, Routes } = require("discord.js");
const commands = require("./commands"); // your commands file

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("⏳ Registering slash commands...");

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log(`✅ ${data.length} commands registered successfully!`);
  } catch (error) {
    console.error("❌ Failed to register commands:", error);
  }
})();
