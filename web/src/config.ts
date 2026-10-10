/** Deployment handoff + pinned Ethereum network. All deployed addresses live here. */
export const config = {
  chainId: 1,
  chainName: "Ethereum",
  deploymentBlock: 26162060,
  sourceCommit: "b33b5572550632fa7512dd5eddb6ef589223bc08",
  rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
  explorer: "https://etherscan.io",
  imdExplorer: "https://explorer.imd.fun",
  addresses: {
    KeelVault: "0xe2fb1c0e5ea5342cd8607efa8e7c44f06b47013c",
    KeelFactory: "0x39dfa7d3ce9364db50433fe9cc2f308c6a219f5f",
    KeelHook: "0x77ad6136c102384d0f1a213bcb241b7d090528cc",
    KeelRouter: "0x072d42c1605e944d53c4bf720c65c27ef88ef2eb",
    KeelToken: "0x89258d7a82ffbb685f3e1551b76c66f4e6d7d9b2",
    IMD: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
    PoolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
    StateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
  },
  abiHashes: {
    KeelToken:
      "800183d3da06e4e75d79226a78abe75460d613f9e8bd3d452ea94bc5d021cf07",
    KeelVault:
      "18b1ec006b627bccc85a18db8a4fc53e093925ef659d25fd3a6d7f567ad092d6",
    KeelFactory:
      "ec56a1be7838cecab487d637cd8b3220d912799958209bd91a656fbb913a4c24",
    KeelRouter:
      "1f250d1582b262e244c80d263358eabbfc7d8b02f8923fedbd7d1683009674d3",
  },
  creationCodeHashes: {
    KeelToken:
      "53bb622d0e0b9d1acb620f51a718b55580f086b28f141da7a4881247eb63dc88",
    KeelVault:
      "2adf1c4e6e436acde5681e235c52eb84502283f2b8aa7026ff71adf7e8c0cfa4",
    KeelFactory:
      "5b20662278a65f15a92660c229376ebc098009289c9a334558152bcafd41b1f1",
    KeelRouter:
      "979f6a56d867be3c7022a4da18d921c479ad3865cabc3154ab3fb94ad83cb4b8",
  },
} as const;

export const addressUrl = (address: string) =>
  `${config.explorer}/address/${address}`;
export const txUrl = (hash: string) => `${config.explorer}/tx/${hash}`;
export const jobUrl = (reference: string) =>
  `${config.imdExplorer}/jobs/${encodeURIComponent(reference)}`;
