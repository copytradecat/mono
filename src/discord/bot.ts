import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from 'dotenv';
import { handleCommand } from './commands/index.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const commands = [
  new SlashCommandBuilder().setName('ct').setDescription('CopyTradeCat commands')
    .addSubcommand(subcommand => subcommand.setName('help').setDescription('Display help message'))
    .addSubcommand(subcommand => subcommand.setName('register').setDescription('Link your Discord account to the web app'))
    .addSubcommand(subcommand => subcommand.setName('wallet').setDescription('Display linked wallet information'))
    .addSubcommand(subcommand => subcommand.setName('balance').setDescription('Show current balance of linked wallet'))
    .addSubcommand(subcommand => subcommand.setName('trade').setDescription('Execute a trade')
      .addNumberOption(option => option.setName('amount').setDescription('Trade amount').setRequired(true))
      .addStringOption(option => option.setName('token').setDescription('Token to trade').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('follow').setDescription('Start copying trades from a specific address')
      .addStringOption(option => option.setName('address').setDescription('Trader address to follow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('unfollow').setDescription('Stop copying trades from a specific address')
      .addStringOption(option => option.setName('address').setDescription('Trader address to unfollow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('list').setDescription('Show list of traders being followed'))
    .addSubcommand(subcommand => subcommand.setName('settings').setDescription('Display current settings'))
    .addSubcommand(subcommand => subcommand.setName('set').setDescription('Update a specific setting')
      .addStringOption(option => option.setName('setting').setDescription('Setting to update').setRequired(true))
      .addStringOption(option => option.setName('value').setDescription('New value for the setting').setRequired(true)))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);

client.once("ready", async () => {
  console.log("Discord bot is ready!");
  try {
    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands },
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering application commands:', error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'ct') {
    const subcommand = interaction.options.getSubcommand();
    await handleCommand(interaction, subcommand);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith('.ct ')) {
    const args = message.content.slice(4).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    await handleCommand(message, command, args);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
