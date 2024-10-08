# CopyTradeCat

CopyTradeCat is a Discord bot and web application for copy trading on the Solana blockchain.

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- pnpm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/copytradecat.git
   cd copytradecat
   ```

2. Create a `.env` file in the root directory and fill in the necessary environment variables:
   ```
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_TEST_CHANNEL_ID=your_test_channel_id
   DISCORD_TEST_USER_ID=your_test_user_id
   MONGODB_URI=your_mongodb_uri
   NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000
   SIGNING_SERVICE_URL=http://localhost:3001
   ENCRYPTION_KEY=your_encryption_key
   BOT_API_KEY=your_bot_api_key
   RATE_LIMIT_MIN_TIME=240
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

### Running the Application

You can run the different components of the application separately or all at once:

#### Run all components
   ```bash
   pnpm run dev
   ```

#### Run components separately

1. Start the web application:
   ```bash
   pnpm run ui:dev
   ```

2. Start the signing service:
   ```bash
   pnpm run server:start
   ```

3. Start the Discord bot:
   ```bash
   pnpm run bot:dev
   ```

The web application will be available at `http://localhost:3000`.

## Features

- Discord bot for copy trading
- Web interface for managing settings and wallets
- Integration with Solana blockchain for trading

## Learn More

To learn more about the technologies used in this project:

- [Jupiter Aggregator API](https://station.jup.ag/docs/apis/swap-api)
- [Solana Web3.js](https://solana.com/developers)
- [Portal MPC Architecture](https://docs.portalhq.io/resources/portals-mpc-architecture)
- [Discord Developer Guide](https://discord.com/developers/docs/intro)
- [Next.js Documentation](https://nextjs.org/docs)
- [bloXroute Txn Bundling](https://docs.bloxroute.com/solana/trader-api-v2/front-running-protection-and-transaction-bundle)
- [jito rpc](https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference)
- [Drift docs](https://docs.drift.trade/)
- [Zeta Markets](https://docs.zeta.markets/)

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

All rights reserved. 