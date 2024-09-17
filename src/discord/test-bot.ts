import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram, SendTransactionError } from '@solana/web3.js';
import fs from 'fs';
import { getQuote, getSwapTransaction, executeSwap } from '../trading/jupiterApi';

dotenv.config({ path: ['.env.local', '.env'] });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const testChannelId = process.env.DISCORD_TEST_CHANNEL_ID;
const testUserId = process.env.DISCORD_TEST_USER_ID;

// Load demo wallets
const demoWallets = [
  Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('test-ledger/demo_wallet_1.json', 'utf-8')))),
  Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('test-ledger/demo_wallet_2.json', 'utf-8')))),
  Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('test-ledger/demo_wallet_3.json', 'utf-8')))),
];

const connection = new Connection('http://localhost:8899', 'confirmed');

const commands = [
  new SlashCommandBuilder().setName('ct').setDescription('CopyTradeCat commands')
    .addSubcommand(subcommand => subcommand.setName('help').setDescription('Display help message'))
    .addSubcommand(subcommand => subcommand.setName('register').setDescription('Link your Discord account to the web app'))
    .addSubcommand(subcommand => subcommand.setName('wallet').setDescription('Add a wallet to trade'))
    .addSubcommand(subcommand => subcommand.setName('balance').setDescription('Show current balance of linked wallet'))
    .addSubcommand(subcommand => subcommand.setName('trade').setDescription('Place a trade')
      .addNumberOption(option => option.setName('amount').setDescription('Amount to trade').setRequired(true))
      .addStringOption(option => option.setName('token').setDescription('Token to trade').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('follow').setDescription('Follow another user')
      .addUserOption(option => option.setName('user').setDescription('User to follow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('unfollow').setDescription('Unfollow a user')
      .addUserOption(option => option.setName('user').setDescription('User to unfollow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('list').setDescription('Show list of traders being followed'))
    .addSubcommand(subcommand => subcommand.setName('settings').setDescription('Display current settings'))
    .addSubcommand(subcommand => subcommand.setName('set').setDescription('Update a specific setting')
      .addStringOption(option => option.setName('setting').setDescription('Setting to update').setRequired(true))
      .addStringOption(option => option.setName('value').setDescription('New value for the setting').setRequired(true)))
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), { body: commands });
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
}

async function simulateUserFlow() {
  if (!testChannelId || !testUserId) {
    console.error('Test channel ID or user ID is not defined');
    return;
  }
  const channel = await client.channels.fetch(testChannelId);
  if (!channel || !channel.isTextBased()) {
    console.error('Invalid test channel');
    return;
  }

  const userFlows = [
    { command: 'ct', options: { subcommand: 'register' } },
    { command: 'ct', options: { subcommand: 'wallet', wallet: demoWallets[0].publicKey.toBase58() } },
    { command: 'ct', options: { subcommand: 'balance', wallet: demoWallets[0].publicKey.toBase58() } },
    { command: 'ct', options: { subcommand: 'follow', user: testUserId } },
    { command: 'ct', options: { subcommand: 'trade', amount: 0.1, token: 'SOL' } },
    { command: 'ct', options: { subcommand: 'list' } },
    { command: 'ct', options: { subcommand: 'settings' } },
    { command: 'ct', options: { subcommand: 'set', setting: 'maxTradeAmount', value: '200' } },
    { command: 'ct', options: { subcommand: 'unfollow', user: testUserId } },
    { command: 'ct', options: { subcommand: 'help' } },
  ];

  for (const flow of userFlows) {
    await channel.send(`Simulating: /${flow.command} ${Object.entries(flow.options).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    
    // Simulate bot response
    const simulatedResponse = await simulateCommandResponse(flow.command, flow.options);
    await channel.send(`Bot response:\n${simulatedResponse}`);
    
    console.log(`Simulated command: /${flow.command}`, flow.options);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds between commands
  }

  console.log('All user flows simulated');
}

async function simulateCommandResponse(command: string, options: any): Promise<string> {
  console.log(`Simulating command response for: ${command}`, options);
  // This function simulates the bot's response to each command
  switch (options.subcommand) {
    case 'register':
      return "Registration successful! Use the web interface to link your wallet. Your default max trade amount is set to 100. Use `.ct set maxTradeAmount <value>` to change this setting.";
    case 'wallet':
      return `Wallet linked: ${options.wallet}`;
    case 'balance':
      try {
        if (!options.wallet) {
          return 'No wallet specified. Please link a wallet first.';
        }
        const balance = await connection.getBalance(new PublicKey(options.wallet));
        console.log(`Balance for wallet ${options.wallet}: ${balance / LAMPORTS_PER_SOL} SOL`);
        return `Your current balance: ${balance / LAMPORTS_PER_SOL} SOL`;
      } catch (error) {
        console.error('Error fetching balance:', error);
        return 'Failed to fetch balance';
      }
    case 'follow':
      return `You are now following user with ID: ${options.user}`;
    case 'trade':
      return simulateTrade(options.amount, options.token);
    case 'list':
      return "Traders you are following:\n1. Trader123\n2. Trader456";
    case 'settings':
      return "Your current settings:\nmaxTradeAmount: 100\ndefaultWallet: 0x1234...";
    case 'set':
      return `Setting updated: ${options.setting} = ${options.value}`;
    case 'unfollow':
      return `You have unfollowed user with ID: ${options.user}`;
    case 'help':
      return "Available commands:\n/ct register\n/ct wallet\n/ct balance\n/ct follow <user>\n/ct trade <amount> <token>\n/ct list\n/ct settings\n/ct set <setting> <value>\n/ct unfollow <user>\n/ct help";
    default:
      return "Unknown command";
  }
}

async function simulateTrade(amount: number, token: string): Promise<string> {
  console.log(`Simulating trade: ${amount} ${token}`);
  try {
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const outputToken = token === 'SOL' ? inputToken : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint address (example)

    const quoteData = await getQuote(inputToken, outputToken, amount * LAMPORTS_PER_SOL);
    console.log('Quote data received:', JSON.stringify(quoteData, null, 2));

    const swapData = await getSwapTransaction(quoteData, demoWallets[0].publicKey.toBase58());
    console.log('Swap data received:', JSON.stringify(swapData, null, 2));

    const signature = await executeSwap(connection, swapData.swapTransaction, demoWallets[0]);

    console.log('Transaction sent:', signature);
    return `Trade simulated: ${amount} SOL swapped for ${token}. Transaction ID: ${signature}`;
  } catch (error) {
    console.error('Unexpected error:', error);
    return `Trade simulation failed: ${error.message}`;
  }
}

client.once('ready', async () => {
  console.log('Test bot is ready');
  await registerCommands();
  await simulateUserFlow();
});

client.login(process.env.DISCORD_BOT_TOKEN)
  .then(() => console.log('Bot is logged in'))
  .catch(error => console.error('Failed to log in:', error));
