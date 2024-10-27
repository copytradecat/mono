import { Client, GatewayIntentBits, ButtonInteraction, ComponentType } from 'discord.js';
import { config } from 'dotenv';
import { handleCommand } from './commands/index';
import { handleBuyCommand } from './commands/buy';
import { connectDB } from '../src/lib/mongodb';
import User, { IUser } from '../src/models/User';
import Channel from '../src/models/Channel';

config();

async function createMockData() {
  await connectDB();

  const mockUsers: Partial<IUser>[] = [
    {
      discordId: '889620302852661310',
      username: 'crosschainerd',
      email: 'human@bcc.pm',
      wallets: [{
        publicKey: 'DeV4UQkc93FPuJcR8yGj9hV2MYJ9cWrGTXEM2ohyzDEv',
        encryptedSecretData: 'mock_encrypted_data',
        secretType: 'seed',
        connectedChannels: ['1285735381328723968'],
        settings: {
          slippage: 300,
          slippageType: 'dynamic',
          smartMevProtection: null,
          transactionSpeed: 'auto',
          priorityFee: 0,
          entryAmounts: [0.000101, 0.000202, 0.000303, 0.000404, 0.000505],
          exitPercentages: [],
          wrapUnwrapSOL: false
        }
      }] as any, // Add type assertion here
      presets: [],
      referrals: []
    },
    {
      discordId: '708109610657120266',
      username: 'productengineer',
      email: 'victor.wu.mail+vw@gmail.com',
      wallets: [{
        publicKey: 'CATsRdbAVz9pRd3w2WnEpfvtjybcJuBbfWwnVRSL2cat',
        encryptedSecretData: 'mock_encrypted_data',
        secretType: 'seed',
        connectedChannels: ['1285735381328723968'],
        settings: {
          slippage: 300,
          slippageType: 'dynamic',
          smartMevProtection: null,
          transactionSpeed: 'auto',
          priorityFee: 0,
          entryAmounts: [0.0000111, 0.0000222, 0.0000333, 0.0000444, 0.0000555],
          exitPercentages: [],
          wrapUnwrapSOL: false
        }
      }] as any, // Add type assertion here
      presets: [],
      referrals: []
    }
  ];

  // for (const mockUser of mockUsers) {
  //   const existingUser = await User.findOne({ discordId: mockUser.discordId });
  //   if (!existingUser) {
  //     await User.create(mockUser);
  //   } else {
  //     await User.findOneAndUpdate(
  //       { discordId: mockUser.discordId },
  //       { $set: mockUser },
  //       { new: true }
  //     );
  //   }
  // }

  // Create mock channel
  const mockChannel = {
    guildId: '890801755938500678',
    channelId: '1285735381328723968',
    isActive: true,
  };

  const existingChannel = await Channel.findOne({ channelId: mockChannel.channelId });
  if (!existingChannel) {
    await Channel.create(mockChannel);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  try {
    await createMockData();

    const channelId = '1285735381328723968';
    const discordId = '889620302852661310';
    const guildId = '890801755938500678';

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Invalid channel');
    }

    const user = await client.users.fetch(discordId);
    if (!user) {
      throw new Error('Invalid user');
    }

    const mockInteraction = {
      commandName: 'ct',
      options: {
        getSubcommand: () => 'buy',
        getString: (name: string) => name === 'token' ? '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' : null,
      },
      user,
      channel,
      channelId,
      guildId,
      deferReply: async () => console.log('Interaction deferred'),
      editReply: async (content: any) => console.log('Interaction editReply:', content),
      reply: async (content: any) => console.log('Reply:', content),
      followUp: async (content: any) => console.log('Interaction followUp:', content),
      isRepliable: () => true,
      isCommand: () => true,
      client,
    };

    console.log('Created mock interaction');

    // Simulate the buy command
    console.log('Executing handleBuyCommand');
    await handleBuyCommand(mockInteraction as any, async (collector) => {
      // Wait for the collector to finish
      const collectorPromise = new Promise<void>((resolve) => {
        collector.on('end', () => {
          resolve();
        });
      });

      // Ensure the collector's 'collect' handler is set up
      // (Moved the setup before the test callback in handleBuyCommand)

      // Create a mock ButtonInteraction with all required properties
      const mockButtonInteraction = {
        customId: 'amount_0',
        isRepliable: () => true,
        deferUpdate: async () => console.log('ButtonInteraction deferUpdate called'),
        user,
        message: {
          interaction: { user },
          edit: async (content: any) => console.log('ButtonInteraction message.edit:', content),
        },
        client,
        reply: async (content: any) => console.log('ButtonInteraction reply:', content),
        followUp: async (content: any) => console.log('ButtonInteraction followUp:', content),
      } as unknown as ButtonInteraction;

      console.log('Simulating button interaction');

      // Emit the 'collect' event
      collector.emit('collect', mockButtonInteraction);

      // Wait for the collector to finish
      await collectorPromise;
    });

    console.log('handleBuyCommand execution completed');

    console.log('Test completed');
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // await User.deleteMany({}); // Clean up mock users
    // await Channel.deleteMany({}); // Clean up mock channels
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
