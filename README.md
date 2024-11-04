# CopyTradeCat

CopyTradeCat is a Discord bot and web application for copy trading on the Solana blockchain.

## Features

- Discord bot for copy trading
- Web interface for managing settings and wallets
- Integration with Solana blockchain for trading

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

   `DISCORD_BOT_TOKEN`: Your Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
   `DISCORD_CLIENT_ID`: Your Discord application's client ID.
   `NEXT_PUBLIC_DISCORD_CLIENT_ID`: Same as `DISCORD_CLIENT_ID`, used in the frontend.
   `MONGODB_URI`: Connection string for your MongoDB database.
   `NEXT_PUBLIC_WEBSITE_URL`: URL where your web app will run (e.g., `http://localhost:3000`).
   `SIGNING_SERVICE_URL`: URL where your signing service is hosted (e.g., `http://localhost:3001`).
   `ENCRYPTION_KEY`: A secret key for encrypting sensitive data.
   `BOT_API_KEY`: API key for bot authentication.
   `RATE_LIMIT_MIN_TIME`: Minimum time between API calls (in milliseconds).


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

  ### Running Tests

    To run the test suite, watches files for changes and reruns tests:
    ```bash
    pnpm run test:watch
    ```


## Usage

  ### Discord Bot Commands

  - `/ct help`: Display help message.
  - `/ct connect`: Connect your wallet.
  - `/ct buy <token>`: Place a buy order for a specified token.
  - `/ct sell <token>`: Place a sell order for a specified token.

  ### Web Application

  - **Dashboard**: Overview of your account and recent trades.
  - **Settings**: Configure your trading preferences.


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
Feel free to submit issues and feature requests!

## Contact
`code@copytradecat.com`

## License

All rights reserved. 