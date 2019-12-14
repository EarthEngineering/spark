const express = require("express")
const router = express.Router()
const chalk = require("chalk")
const wait = require("../utils/wait")
const _ = require("lodash")
const accountsGeneration = require("../utils/accountsGeneration")

const earthWebBuilder = require("../utils/earthWebBuilder")
const config = require("../config")

let testingAccounts
let formattedTestingAccounts

function flatAccounts() {
  let privateKeys = testingAccounts.privateKeys
  for (let j = 0; j < testingAccounts.more.length; j++) {
    privateKeys = privateKeys.concat(testingAccounts.more[j].privateKeys)
  }
  return privateKeys
}

async function getBalances() {
  const earthWeb = earthWebBuilder()

  const balances = []
  let k = 0
  let privateKeys = flatAccounts()

  for (let i = 0; i < privateKeys.length; i++) {
    let address = earthWeb.address.fromPrivateKey(privateKeys[i])
    balances[k++] = await earthWeb.earth.getBalance(address)
  }
  return Promise.resolve(balances)
}

let earthSent = {}

async function verifyAccountsBalance(options) {
  const env = config.getEnv()

  if (!options) {
    options = env
  } else {
    options = _.defaults(options, env)
  }

  const earthWeb = earthWebBuilder()

  console.log(
    chalk.gray(
      "...\nLoading the accounts and waiting for the node to mine the transactions..."
    )
  )

  const amount = options.defaultBalance || 10000
  const balances = []
  let ready = 0
  let count = 1
  let accounts = !testingAccounts.more.length
    ? testingAccounts
    : testingAccounts.more[testingAccounts.more.length - 1]
  let privateKeys = accounts.privateKeys

  while (true) {
    console.log(chalk.gray(`(${count++}) Waiting for receipts...`))
    for (let i = 0; i < privateKeys.length; i++) {
      let address = earthWeb.address.fromPrivateKey(privateKeys[i])
      if (
        privateKeys[i] !== earthWeb.defaultPrivateKey &&
        !earthSent[address]
      ) {
        let result = await earthWeb.earth.sendTransaction(
          address,
          earthWeb.toSol(amount)
        )
        if (result.result) {
          console.log(chalk.gray(`Sending ${amount} EARTH to ${address}`))
          earthSent[address] = true
        }
      } else if (!balances[i]) {
        let balance = await earthWeb.earth.getBalance(address)
        if (balance > 0) {
          balances[i] = balance
          ready++
        }
      }
    }
    if (ready < privateKeys.length) await wait(3)
    else break
  }
  console.log(chalk.gray("Done.\n"))
  return Promise.resolve(balances)
}

async function formatAccounts(balances, format) {
  const earthWeb = earthWebBuilder()

  const privateKeys = flatAccounts()

  formattedTestingAccounts = "Available Accounts\n==================\n\n"
  for (let i = 0; i < privateKeys.length; i++) {
    let address = earthWeb.address.fromPrivateKey(privateKeys[i])

    formattedTestingAccounts += `(${i}) ${
      format === "hex" ? earthWeb.address.toHex(address) : address
    } (${earthWeb.fromSol(balances[i])} EARTH)\n${
      format === "all" ? "    " + earthWeb.address.toHex(address) + "\n" : ""
    }`
  }

  formattedTestingAccounts += "\nPrivate Keys\n==================\n\n"

  for (let i = 0; i < privateKeys.length; i++) {
    formattedTestingAccounts += `(${i}) ${privateKeys[i]}\n`
  }

  formattedTestingAccounts +=
    "\nHD Wallet\n" +
    "==================\n" +
    "Mnemonic:      " +
    testingAccounts.mnemonic +
    "\n" +
    "Base HD Path:  " +
    testingAccounts.hdPath +
    "{account_index}\n"

  return Promise.resolve()
}

function logRouter(route) {
  console.log(chalk.bold(chalk.cyan("\n\nADMIN"), `/admin/${route}`))
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,Content-Type,Accept"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
  return res
}

router.get("/accounts", async function(req, res) {
  logRouter("accounts")
  const balances = await getBalances()
  await formatAccounts(balances, req.query.format)
  res.set("Content-Type", "text/plain").send(formattedTestingAccounts)
})

router.get("/set-env", async function(req, res) {
  logRouter("set-env")
  const env = config.getEnv(req.query)

  for (let key in env) {
    process.env[key] = env[key]
  }

  console.log("New env: ", config.getEnv())
  res.set("Content-Type", "text/plain").send("Environment variable updated")
})

router.get("/accounts-json", function(req, res) {
  logRouter("accounts-json")
  res.header("Content-Type", "application/json")
  res = setCors(res)
  res.json(testingAccounts)
})

router.get("/accounts-generation", async function(req, res) {
  logRouter("accounts-generation")

  testingAccounts = await accountsGeneration()
  await verifyAccountsBalance()
  const balances = await getBalances()
  await formatAccounts(balances)
  console.log(formattedTestingAccounts)
  res.send()
})

router.get("/temporary-accounts-generation", async function(req, res) {
  logRouter("accounts-generation")

  const options = req.query || {}
  options.addAccounts = true
  testingAccounts = await accountsGeneration(options)
  await verifyAccountsBalance()
  const balances = await getBalances()
  await formatAccounts(balances)
  res = setCors(res)
  res.set("Content-Type", "text/plain").send(formattedTestingAccounts)
})

router.get("/", function(req, res) {
  res.send("Welcome to EARTH Spark" + require("../../package").version)
})

module.exports = router
