import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { handleCommand } from './commands/index.js';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/mongodb.js';
import dotenv from 'dotenv';

dotenv.config({ path: ['../.env.local', '../.env'] });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
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
    .addSubcommand(subcommand => subcommand.setName('buy').setDescription('Place a buy order')
      .addStringOption(option => 
        option.setName('token')
          .setDescription('Token address to buy')
          .setRequired(true)
      ))
    .addSubcommand(subcommand => subcommand.setName('sell').setDescription('Place a sell order')
      .addStringOption(option => 
        option.setName('token')
          .setDescription('Token address to sell')
          .setRequired(true)
      ))
    .addSubcommand(subcommand => subcommand.setName('follow').setDescription('Start copying trades from a specific address')
      .addStringOption(option => option.setName('address').setDescription('Trader address to follow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('unfollow').setDescription('Stop copying trades from a specific address')
      .addStringOption(option => option.setName('address').setDescription('Trader address to unfollow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('list').setDescription('Show list of traders being followed'))
    .addSubcommand(subcommand => subcommand.setName('settings').setDescription('Display current settings'))
    .addSubcommand(subcommand => subcommand.setName('set').setDescription('Update a specific setting')
      .addStringOption(option => option.setName('setting').setDescription('Setting to update').setRequired(true))
      .addStringOption(option => option.setName('value').setDescription('New value for the setting').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('setup').setDescription('Initialize the CopyTradeCat bot for this server'))
    .addSubcommand(subcommand => subcommand.setName('info').setDescription('Display channel status and recent trades'))
    .addSubcommand(subcommand => subcommand.setName('shutdown').setDescription('Disable the CopyTradeCat bot for this server'))
    .addSubcommand(subcommand => subcommand.setName('profile').setDescription('Display your wallet information and token balances')),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);

async function startBot() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    await client.login(process.env.DISCORD_BOT_TOKEN);
    console.log("Discord bot is ready!");

    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands },
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error starting the bot:', error);
    process.exit(1);
  }
}

startBot();

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ct') {
    const subcommand = interaction.options.getSubcommand();
    const args = interaction.options.data.map(option => option.value as string);
    await handleCommand(interaction, subcommand, args);
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
