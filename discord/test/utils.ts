import { Client, ButtonInteraction, InteractionCollector } from 'discord.js';

interface MockInteractionOptions {
  mode: 'BUY' | 'SELL';
  tokenAddress: string;
  settings: any;
}

const mockUsers =[{
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
}];
export const mockDatabase = {
  users: mockUsers,
  findOne: async (query: any) => {
    const user = mockUsers.find(u => u.discordId === query.discordId);
    return user || null;
  }
};

export function createMockInteraction(client: Client, options: MockInteractionOptions) {
  const mockUser = mockUsers[0];

  // Mock the database functions
  const UserAccount = {
    findOne: mockDatabase.findOne
  };

  // Create a proper collector with event handling
  class MockCollector {
    callbacks: Map<string, Function>;
    
    constructor() {
      this.callbacks = new Map();
    }

    on(event: string, callback: Function) {
      this.callbacks.set(event, callback);
      return this;
    }

    stop() {
      // Trigger end event if registered
      const endCallback = this.callbacks.get('end');
      if (endCallback) {
        endCallback([], 'stop');
      }
    }

    emit(event: string, ...args: any[]) {
      const callback = this.callbacks.get(event);
      if (callback) {
        callback(...args);
      }
    }
  }

  const mockCollector = new MockCollector();

  return {
    commandName: 'ct',
    options: {
      getSubcommand: () => options.mode.toLowerCase(),
      getString: (name: string) => {
        if (options.mode === 'SELL') {
          return options.tokenAddress;
        }
        return name === 'token' ? options.tokenAddress : 'So11111111111111111111111111111111111111112';
      }
    },
    user: {
      id: mockUser.discordId,  // Changed from mockUser.id
      tag: mockUser.username   // Changed from mockUser.tag
    },
    channel: {
      id: '1285735381328723968',
      type: 'GUILD_TEXT',
      createMessageComponentCollector: () => mockCollector,
      createMessageCollector: () => mockCollector
    },
    channelId: '1285735381328723968',
    guildId: '890801755938500678',
    deferReply: async () => console.log('Interaction deferred'),
    editReply: async (content: any) => console.log('Interaction editReply:', content),
    reply: async (content: any) => console.log('Reply:', content),
    followUp: async (content: any) => console.log('Interaction followUp:', content),
    isRepliable: () => true,
    isCommand: () => true,
    client,
    UserAccount
  };
}

export async function simulateButtonInteraction(
  collector: InteractionCollector<ButtonInteraction>,
  buttonId: string
) {
  console.log(`Simulating button interaction: ${buttonId}`);
  
  const mockButtonInteraction = {
    customId: buttonId,
    isRepliable: () => true,
    deferUpdate: async () => console.log('ButtonInteraction deferUpdate called'),
    user: { id: '889620302852661310' },
    message: {
      interaction: { user: { id: '889620302852661310' } },
      edit: async (content: any) => {
        console.log('ButtonInteraction message.edit:', content);
        return content;
      },
    },
    editReply: async (content: any) => {
      console.log('ButtonInteraction editReply:', content);
      return content;
    },
    reply: async (content: any) => {
      console.log('ButtonInteraction reply:', content);
      return content;
    },
    followUp: async (content: any) => {
      console.log('ButtonInteraction followUp:', content);
      return content;
    },
  } as unknown as ButtonInteraction;

  // Simulate the button click
  collector.emit('collect', mockButtonInteraction);
  
  // Wait for initial processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simulate swap confirmation after preview
  console.log('Simulating swap confirmation...');
  const swapConfirmCollector = collector as any;
  swapConfirmCollector.emit('collect', {
    ...mockButtonInteraction,
    customId: 'swap_now'
  });
  
  // Wait for swap processing
  await new Promise(resolve => setTimeout(resolve, 2000));
}
