import { program } from 'commander';
import log from 'loglevel';
import { Keypair, PublicKey, TransactionInstruction, } from '@solana/web3.js';
import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { readFileSync, writeFileSync } from 'fs';
import {
    getParsedNftAccountsByOwner,
} from "@nfteyez/sol-rayz";
import axios from 'axios';
import cheerio from 'cheerio';


programCommand('batch_drop')
    .option('-u, --holders <string>', 'Holders file')
    .option('-b, --block <string>', 'NFTs to ignore')
    .action(async (directory, cmd) => {
        const { keypair, env, rpc, holders, block } = cmd.opts();
        //console.log(cmd.opts());
        const walletKeyPair = loadWalletKey(keypair);
        let connection;
        if (rpc !== "") {
            connection = new web3.Connection(rpc, { confirmTransactionInitialTimeout: 120000 });
        }
        else {
            connection = new web3.Connection(web3.clusterApiUrl(env), { confirmTransactionInitialTimeout: 120000 });
        }

        //console.log(holders);
        let holdersJson = JSON.parse(readFileSync(holders).toString());
        //console.log(holdersJson.length);

        let blockJson = JSON.parse(readFileSync(block).toString());
        //console.log(blockJson);

        const nftArray = await getParsedNftAccountsByOwner({
            publicAddress: walletKeyPair.publicKey.toString(),
        });
        //console.log(nftArray);
        let transferables: String[] = [];
        for (let nft of nftArray) {
            if (!(blockJson.ignore.includes(nft.mint))) {
                transferables.push(nft.mint);
                //console.log(nft.mint);
            }
        }
        //console.log(transferables.length);
        //console.log(transferables);

        let receivers: String[] = [];
        for (let holder of holdersJson) {
            //console.log(holder.owner_wallet);
            if (holder.owner_wallet !== walletKeyPair.publicKey.toString()) {
                receivers.push(holder.owner_wallet);
            }
        }
        //console.log(receivers.length);
        //console.log(receivers);

        for (let receiver of receivers) {
            if (receiver !== "3HxqsUguP6E7CNqjvpEAnJ8v86qbyJgWvN2idAKygLdD") {
                await transfer(connection, walletKeyPair, walletKeyPair.publicKey.toString(), receiver, transferables.pop());
            }
        }
    });

programCommand('batch_token_drop')
    .option('-u, --counts <string>', 'Holder counts file (see snapshot_to_count)')
    .option('-m, --mint <string>', 'The token mint to transfer')
    .option('-f, --errorFile <string>', 'The output file to write errors to')
    .action(async (directory, cmd) => {
        const { keypair, env, rpc, counts, mint, errorFile } = cmd.opts();
        const walletKeyPair = loadWalletKey(keypair);
        let connection;
        if (rpc !== "") {
            connection = new web3.Connection(rpc, { confirmTransactionInitialTimeout: 360000 });
        }
        else {
            connection = new web3.Connection(web3.clusterApiUrl(env), { confirmTransactionInitialTimeout: 360000 });
        }

        let holdersJson = JSON.parse(readFileSync(counts).toString());

        let errors = new Map<String, number>();
        for (let holder of holdersJson) {
            let result = await transferToken(connection, walletKeyPair, walletKeyPair.publicKey.toString(), holder[0], mint, holder[1]);
            if (!result) {
                errors.set(holder[0], holder[1]);
            }
            writeFileSync(errorFile, JSON.stringify(Array.from(errors.entries()), null, 2));
        }
    });

programCommand('verify_token_amounts')
    .option('-u, --counts <string>', 'Holder counts file (see snapshot_to_count)')
    .option('-m, --mint <string>', 'The token mint to transfer')
    .option('-f, --errorFile <string>', 'The output file to write errors to')
    .action(async (directory, cmd) => {
        const { keypair, env, rpc, counts, mint, errorFile } = cmd.opts();
        const walletKeyPair = loadWalletKey(keypair);
        let connection;
        if (rpc !== "") {
            connection = new web3.Connection(rpc, { confirmTransactionInitialTimeout: 60000 });
        }
        else {
            connection = new web3.Connection(web3.clusterApiUrl(env));
        }

        let holdersJson = JSON.parse(readFileSync(counts).toString());

        let errors = new Map<String, number>();
        for (let holder of holdersJson) {
            //let result = await transferToken(connection, walletKeyPair, walletKeyPair.publicKey.toString(), holder[0], mint, holder[1]);
            //if (!result) {
            //    errors.set(holder[0], holder[1]);
            //}
            let atas = await connection.getTokenAccountsByOwner(new PublicKey(holder[0]), { mint: new PublicKey(mint) });
            //console.log(atas.value[0]);
            if (atas.value[0] !== undefined) {
                let ai = await connection.getParsedAccountInfo(atas.value[0].pubkey);
                console.log("%s: %s", holder[0], ai.value.data.parsed.info.tokenAmount.amount);
                if (ai.value.data.parsed.info.tokenAmount.amount === '0') {
                    errors.set(holder[0], holder[1]);
                }
            }
            else {
                errors.set(holder[0], holder[1]);
            }
        }
        console.log(errors);

        writeFileSync(errorFile, JSON.stringify(Array.from(errors.entries()), null, 2));
    });

programCommand('verify_txes')
    .option('-u, --txFile <string>', 'Transactions file')
    .action(async (directory, cmd) => {
        const { keypair, env, rpc, txFile } = cmd.opts();
        const walletKeyPair = loadWalletKey(keypair);
        let connection;
        if (rpc !== "") {
            connection = new web3.Connection(rpc);
        }
        else {
            connection = new web3.Connection(web3.clusterApiUrl(env));
        }

        //console.log(holders);
        let txesJson = JSON.parse(readFileSync(txFile).toString());
        for (let tx of txesJson){
            let response = await connection.getTransaction(tx);
            if (response === null){
                console.log(tx);
            }
        }
    });

programCommand('snapshot_amount')
    .option('-u, --holders <string>', 'Holders file')
    .option('-f, --filter <string>', "The creator filter to search for")
    .action(async (directory, cmd) => {
        const { keypair, env, rpc, holders, filter } = cmd.opts();
        const walletKeyPair = loadWalletKey(keypair);
        let connection;
        if (rpc !== "") {
            connection = new web3.Connection(rpc);
        }
        else {
            connection = new web3.Connection(web3.clusterApiUrl(env));
        }

        let holdersJson = JSON.parse(readFileSync(holders).toString());

        let receivers: String[] = [];
        for (let holder of holdersJson) {
            if (holder.owner_wallet !== walletKeyPair.publicKey.toString()) {
                receivers.push(holder.owner_wallet);
            }
        }

        let holderAmounts = new Map()
        for (let receiver of receivers) {
            if (!holderAmounts.has(receiver)) {
                const holderNFTs = await getParsedNftAccountsByOwner({
                    publicAddress: receiver.toString(),
                });

                let count = 0;
                for (let nft of holderNFTs) {
                    if (nft.data.creators && nft.data.creators[0].address === filter && nft.data.creators[0].verified === 1) {
                        count++;
                    }
                }

                holderAmounts.set(receiver, count);
                await delay(1000);
            }
        }
        console.log(JSON.stringify(Array.from(holderAmounts.entries())));
    });

programCommand('snapshot_to_count')
    .option('-u, --holders <string>', 'Holders file')
    .option('-o, --out <string>', 'The output file to write the amounts to')
    .action(async (directory, cmd) => {
        const { keypair, env, rpc, holders, out } = cmd.opts();
        let holdersJson = JSON.parse(readFileSync(holders).toString());

        let receivers = new Map<String, number>();
        for (let holder of holdersJson) {
            console.log(holder.owner_wallet);
            if (receivers.has(holder.owner_wallet)) {
                receivers.set(holder.owner_wallet, receivers.get(holder.owner_wallet) + 1);
            }
            else {
                receivers.set(holder.owner_wallet, 1);
            }
        }
        writeFileSync(out, JSON.stringify(Array.from(receivers.entries()), null, 2));
    });

programCommand('fetch_rarities')
    .option('-c, --collection <string>', 'The collection to scrape')
    .option('--start <number>', 'The first NFT number')
    .option('--end <number>', 'The last NFT number')
    .option('-o, --out <string>', 'The output file to write the rarities to')
    .action(async (directory, cmd) => {
        //console.log(cmd.opts());
        const { keypair, env, rpc, collection, start, end, out } = cmd.opts();
        //const walletKeyPair = loadWalletKey(keypair);
        //let connection;
        //if (rpc !== "") {
        //    connection = new web3.Connection(rpc);
        //}
        //else {
        //    connection = new web3.Connection(web3.clusterApiUrl(env));
        //}

        let rarity_data = { rarities: [] };
        const axios_instance = axios.create();

        for (let i = +start; i <= +end; i++) {
            console.log("Fetching " + i.toString());
            const url = "https://moonrank.app/collection/" + collection + "/" + i.toString();
            //console.log(url);
            const response = await axios_instance.get(url);
            const html = response.data;
            const $ = cheerio.load(html);

            // Get the rank
            let rank;
            const rankField = $(".text-mr-lumen-purple.bg-mr-heading-purple.px-2").get(0);
            for (let field of rankField.children) {
                if (field['name'] === 'span') {
                    let value = Number(field['children'][0].data);
                    if (!isNaN(value)) {
                        //console.log(value);
                        rank = value;
                        break;
                    }
                }
            }

            // Get the token
            let token;
            const links = $('a');
            for (let link of links) {
                if ($(link).attr('href').includes('token')) {
                    //console.log($(link).text());
                    token = $(link).text();
                    break;
                }
            }

            rarity_data.rarities.push({ token: token, rank: rank });
            await delay(100);
        }

        //console.log(rarity_data);
        writeFileSync(out, JSON.stringify(rarity_data));
    });

function programCommand(name: string) {
    return program
        .command(name)
        .option(
            '-e, --env <string>',
            'Solana cluster env name',
            'devnet', //mainnet-beta, testnet, devnet
        )
        .option(
            '-r, --rpc <string>',
            "The endpoint to connect to.",
        )
        .option(
            '-k, --keypair <path>',
            `Solana wallet location`,
            '--keypair not provided',
        )
        .option('-l, --log-level <string>', 'log level', setLogLevel);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
    if (value === undefined || value === null) {
        return;
    }
    log.info('setting the log value to: ' + value);
    log.setLevel(value);
}

program.parse(process.argv);

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadWalletKey(keypair): Keypair {
    if (!keypair || keypair == '') {
        throw new Error('Keypair is required!');
    }
    const loaded = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(readFileSync(keypair).toString())),
    );
    log.info(`wallet public key: ${loaded.publicKey}`);
    return loaded;
}

async function transfer(connection: web3.Connection, payer: web3.Signer, from: String, to: String, token: String) {
    let fromKey = new PublicKey(from);
    let toKey = new PublicKey(to);
    let tokenKey = new PublicKey(token);

    console.log("Transfering %s to %s", tokenKey.toString(), toKey.toString());
    let fromATA = await splToken.getAssociatedTokenAddress(tokenKey, fromKey);

    let fromBalance = (await connection.getTokenAccountBalance(fromATA)).value.amount;
    let newFromBalance = (+fromBalance - 1).toString();
    while (+fromBalance > +newFromBalance) {
        let toATA: PublicKey;
        try {
            toATA = (await splToken.getOrCreateAssociatedTokenAccount(connection, payer, tokenKey, toKey)).address;
            //console.log("To: %d", (await connection.getTokenAccountBalance(toATA)).value.amount);

            await splToken.transferChecked(connection, payer, fromATA, tokenKey, toATA, fromKey, 1, 0);

            fromBalance = (await connection.getTokenAccountBalance(fromATA)).value.amount;
            //toBalance = (await connection.getTokenAccountBalance(toATA)).value.amount;
        }
        catch (e) {
            console.log(e);
            if (e.name === "TokenOwnerOffCurveError") {
                break;
            }
            try {
                fromBalance = (await connection.getTokenAccountBalance(fromATA)).value.amount;
                //toBalance = (await connection.getTokenAccountBalance(toATA)).value.amount;
            }
            catch (e) {
                console.log(e);
            }
        }
    }
}

async function transferToken(connection: web3.Connection, payer: web3.Signer, from: String, to: String, token: String, amount: number): Promise<boolean> {
    let fromKey = new PublicKey(from);
    let toKey = new PublicKey(to);
    let tokenKey = new PublicKey(token);

    console.log("Transfering %d %s to %s", amount, tokenKey.toString(), toKey.toString());
    let instructions: TransactionInstruction[] = [];

    try {
        let fromATA = await splToken.getAssociatedTokenAddress(tokenKey, fromKey);
        //let toATA = (await splToken.getOrCreateAssociatedTokenAccount(connection, payer, tokenKey, toKey)).address;
        let toATA = await splToken.getAssociatedTokenAddress(tokenKey, toKey, false);
        let toATAData = await connection.getAccountInfo(toATA);
        if (toATAData === null) {
            console.log("Creating token account for %s", to);
            instructions.push(splToken.createAssociatedTokenAccountInstruction(payer.publicKey, toATA, toKey, tokenKey));
        }

        instructions.push(splToken.createTransferCheckedInstruction(fromATA, tokenKey, toATA, fromKey, amount, 0));
        const tx: web3.Transaction = new web3.Transaction().add(
            ...instructions);
        //console.log(await connection.sendTransaction(tx, [payer]));
        await web3.sendAndConfirmTransaction(connection, tx, [payer])
    }
    catch (e) {
        console.log(e);
        if (e.name === "TokenOwnerOffCurveError") {
            console.log("Token Account off-curve.")
            return true;
        } else {
            console.log("Error during transfer, investigate further.");
            return false;
        }
    }

    return true;
}