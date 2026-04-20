import { NextRequest, NextResponse } from "next/server";

const COVALENT_API_KEY = process.env.COVALENT_API_KEY;
const QUICKNODE_URL = process.env.QUICKNODE_URL;

const CHAIN_ID_TO_COVALENT: Record<number, string> = {
  1:     "eth-mainnet",
  42161: "arbitrum-mainnet",
  8453:  "base-mainnet",
  137:   "matic-mainnet",
};

const CHAIN_ID_TO_DEFILLAMA: Record<number, string> = {
  1:     "ethereum",
  42161: "arbitrum",
  8453:  "base",
  137:   "polygon",
};

async function getNativeBalance(address: string, chainId: number): Promise<number> {
  if (!QUICKNODE_URL) return 0;
  try {
    const res = await fetch(QUICKNODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
      }),
    });
    const { result } = await res.json();
    return parseInt(result, 16) / 1e18;
  } catch {
    return 0;
  }
}

async function getErc20Balances(address: string, chainId: number) {
  if (!COVALENT_API_KEY) {
    return { items: [], source: "unavailable", note: "Set COVALENT_API_KEY for ERC-20 discovery" };
  }

  const chainName = CHAIN_ID_TO_COVALENT[chainId];
  if (!chainName) return { items: [], source: "unsupported_chain" };

  try {
    const url = `https://api.covalenthq.com/v1/${chainName}/address/${address}/balances_v2/`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${COVALENT_API_KEY}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) return { items: [], source: "covalent_error", status: res.status };

    const data = await res.json();
    const items = (data.data?.items || [])
      .filter((t: Record<string, unknown>) => Number(t.balance) > 0 && t.contract_ticker_symbol !== null)
      .map((t: Record<string, unknown>) => ({
        symbol: t.contract_ticker_symbol,
        name: t.contract_name,
        address: t.contract_address,
        balance: Number(t.balance) / Math.pow(10, Number(t.contract_decimals)),
        decimals: t.contract_decimals,
        priceUsd: t.quote_rate ?? 0,
        valueUsd: t.quote ?? 0,
        logoUrl: t.logo_url,
        type: t.type,
        isLp: (t.type as string)?.includes("lp") || (t.contract_name as string)?.toLowerCase().includes("lp"),
      }));

    return { items, source: "covalent" };
  } catch {
    return { items: [], source: "covalent_fetch_error" };
  }
}

async function getTokenPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chainId = parseInt(searchParams.get("chainId") ?? "1");

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 });
  }

  const [nativeBalance, erc20Data] = await Promise.all([
    getNativeBalance(address, chainId),
    getErc20Balances(address, chainId),
  ]);

  // Fetch ETH price for native balance valuation
  const nativeSymbol = chainId === 137 ? "MATIC" : "ETH";
  const nativePrice = await getTokenPrice(nativeSymbol);
  const nativeValueUsd = nativePrice ? nativeBalance * nativePrice : null;

  const nativeToken = {
    symbol: nativeSymbol,
    name: chainId === 137 ? "Polygon" : "Ethereum",
    address: "native",
    balance: nativeBalance,
    priceUsd: nativePrice,
    valueUsd: nativeValueUsd,
    isNative: true,
    isLp: false,
  };

  const tokens = erc20Data.items || [];
  const lpPositions = tokens.filter((t: Record<string, unknown>) => t.isLp);
  const regularTokens = tokens.filter((t: Record<string, unknown>) => !t.isLp);

  const totalUsd = [nativeToken, ...tokens].reduce((sum: number, t: Record<string, unknown>) => {
    return sum + (typeof t.valueUsd === "number" ? t.valueUsd : 0);
  }, 0);

  return NextResponse.json({
    address,
    chainId,
    chain: CHAIN_ID_TO_DEFILLAMA[chainId] ?? "unknown",
    totalValueUsd: Math.round(totalUsd * 100) / 100,
    nativeToken,
    tokens: regularTokens,
    lpPositions,
    dataSource: erc20Data.source,
    ...(erc20Data.note ? { note: erc20Data.note } : {}),
  });
}
