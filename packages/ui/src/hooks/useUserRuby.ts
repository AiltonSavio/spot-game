import { useQuery } from "@tanstack/react-query";
import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

export function useUserRuby(gameId: string, pkgId: string) {
  const client = useSuiClient();
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ["userRuby", gameId, pkgId, account?.address],
    queryFn: async () => {
      if (!account) throw new Error("Wallet not connected");

      const txb = new Transaction();
      txb.moveCall({
        target: `${pkgId}::spot_game::get_user_ruby`,
        arguments: [txb.object(gameId), txb.pure.address(account.address)],
      });

      // simulate it, no gas spent, no state change
      const res = await client.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: account.address,
      });

      const raw = (res as any).results[0].returnValues[0][0] as number[];

      let val = 0;
      for (let i = 0; i < raw.length; i++) {
        val += raw[i] * 2 ** (8 * i);
      }
      return val;
    },
    enabled: Boolean(gameId && account),
    staleTime: 30_000, // stale for 30s by default
  });
}
