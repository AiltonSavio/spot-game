"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SpotGameBoard from "@/components/SpotGameBoard";
import PayoutTable from "@/components/PayoutTable";
import GameInfo, { PaymentOption } from "@/components/GameInfo";
import {
  useCurrentAccount,
  ConnectButton,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "@/components/ui/sonner";
import { XCircle, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { formatNumber, formatSui, hexToBytes, utf8ToBytes } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import Image from "next/image";
import { useUserRuby } from "@/hooks/useUserRuby";

const MAX_NUM = 80;
const NUMBERS_TO_CHOOSE = 10;
const ENTRY_FEE = 100_000_000; // 0.1 SUI
const ROUND_DURATION = 10 * 60; // seconds

export default function HomePage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const gameId = process.env.NEXT_PUBLIC_SPOT_GAME_ID!;
  const pkgId = process.env.NEXT_PUBLIC_SPOT_PKG_ID!;
  const suiEnv = process.env.NEXT_PUBLIC_SUI_ENV || "devnet";

  const [admin, setAdmin] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [roundInfo, setRoundInfo] = useState({
    roundNumber: 0,
    bets: [],
    players: 0,
    timeLeft: ROUND_DURATION,
    lastWinning: [] as number[],
  });
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // admin-only modal state + form fields
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [outputHex, setOutputHex] = useState("");
  const [alphaString, setAlphaString] = useState("");
  const [proofHex, setProofHex] = useState("");
  const [isLoadingJoin, setIsLoadingJoin] = useState(false);
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("sui");
  const {
    data: rubyBalance,
    isLoading: isLoadingRubyBalance,
    refetch: refetchRubyBalance,
  } = useUserRuby(gameId, pkgId);

  // fetch current game object on load and on account change
  const {
    data: gameObj,
    isLoading,
    refetch,
  } = useSuiClientQuery("getObject", {
    id: gameId,
    options: {
      showContent: true,
      showOwner: true,
    },
  });

  const {
    data: suiBalance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useSuiClientQuery("getBalance", {
    owner: account?.address || "",
  });

  useEffect(() => {
    if (gameObj?.data) {
      const content = gameObj?.data?.content;
      const fields = (content as any)?.fields;
      setAdmin(fields?.admin);
      const round_number = fields?.round_number || "0";
      const round = fields?.current_round || null;
      const endTimeMs = Number(round?.fields?.end_time_ms);
      const winning_numbers = (fields?.winning_numbers as any[]) || [];
      const bets = (round?.fields?.bets as any[]) || [];
      setRoundInfo({
        roundNumber: Number(round_number),
        bets: bets as never[],
        players: bets.length,
        timeLeft: endTimeMs
          ? Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000))
          : 0,
        lastWinning: winning_numbers?.map((b: number) => b) || [],
      });
    }
  }, [gameObj]);

  useEffect(() => {
    // Don’t start the timer if there's no round
    if (roundInfo.timeLeft <= 0) return;

    const timer = setInterval(() => {
      setRoundInfo((prev) => {
        const next = prev.timeLeft - 1;
        return { ...prev, timeLeft: next >= 0 ? next : 0 };
      });
    }, 1000);

    // Clean up on unmount or when timeLeft changes
    return () => clearInterval(timer);
  }, [roundInfo.timeLeft]);

  // when the timer hit zero, wait 2 s then refetch
  useEffect(() => {
    if (roundInfo.timeLeft !== 0) return;
    const timeout = setTimeout(() => {
      refetch();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [roundInfo.timeLeft, refetch]);

  const toggleNumber = (n: number) => {
    setSelected((prev) => {
      if (prev.includes(n)) {
        return prev.filter((x) => x !== n);
      } else {
        if (prev.length < NUMBERS_TO_CHOOSE) {
          return [...prev, n];
        } else {
          toast.warning("Maximum Selection Reached", {
            description: `You can only select ${NUMBERS_TO_CHOOSE} numbers.`,
            icon: <AlertTriangle className="h-5 w-5" />,
          });
          return prev;
        }
      }
    });
  };

  const clearSelection = () => setSelected([]);

  const autoPick = () => {
    const picks: number[] = [];
    while (picks.length < NUMBERS_TO_CHOOSE) {
      const r = Math.floor(Math.random() * MAX_NUM) + 1;
      if (!picks.includes(r)) picks.push(r);
    }
    setSelected(picks);
  };

  function buildTriggerTx(): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      package: pkgId,
      module: "spot_game",
      function: "trigger_new_round",
      arguments: [
        tx.object(gameId),
        tx.pure.vector("u8", hexToBytes(outputHex)),
        tx.pure.vector("u8", utf8ToBytes(alphaString)),
        tx.pure.vector("u8", hexToBytes(proofHex)),
        tx.object.clock(),
      ],
    });
    return tx;
  }

  async function doTrigger() {
    setIsAdminOpen(false);
    signAndExecuteTransaction(
      { transaction: buildTriggerTx(), chain: `sui:${suiEnv}` },
      {
        onSuccess: async () => {
          toast.success("Round started!", {
            description: "New round has been triggered.",
          });

          await refetch();
        },
        onError: (e) =>
          toast.error("Failed to start round", {
            description: e.message,
            icon: <XCircle className="h-5 w-5" />,
          }),
      }
    );
  }

  const buildJoinRoundTx = () => {
    const tx = new Transaction();
    // build common args
    const picksArg = tx.pure.vector("u8", selected);
    const gameArg = tx.object(gameId);
    const clockArg = tx.object.clock();

    if (paymentOption === "sui") {
      // pull 0.1 SUI out of gas
      const [coin] = tx.splitCoins(tx.gas, [ENTRY_FEE]);
      tx.moveCall({
        package: pkgId,
        module: "spot_game",
        function: "join_round_with_sui",
        arguments: [picksArg, coin, gameArg, clockArg],
      });
    } else {
      // no coin, just call the ruby entry
      tx.moveCall({
        package: pkgId,
        module: "spot_game",
        function: "join_round_with_ruby",
        arguments: [picksArg, gameArg, clockArg],
      });
    }

    return tx;
  };

  const joinRound = async () => {
    // Check if the wallet is connected
    if (!account) {
      toast.error("Wallet Not Connected", {
        description: "Please connect your wallet to play.",
        icon: <XCircle className="h-5 w-5" />,
      });
      return;
    }

    // Check if the user has selected 10 numbers
    if (selected.length < NUMBERS_TO_CHOOSE) {
      toast.error("Invalid Selection", {
        description: `Please select ${NUMBERS_TO_CHOOSE} numbers before playing.`,
        icon: <XCircle className="h-5 w-5" />,
      });
      return;
    }

    const noCurrentRound = roundInfo.timeLeft === 0;
    if (noCurrentRound) {
      toast.error("No Current Round", {
        description: "There's no round currently to join",
        icon: <XCircle className="h-5 w-5" />,
      });
      return;
    }

    // Check if the user is already participating in this round
    const userAlreadyInRound = roundInfo.bets.some(
      (bet: any) => bet.fields?.player === account.address
    );
    if (userAlreadyInRound) {
      toast.error("Already Participating", {
        description: "You are already participating in this round.",
        icon: <XCircle className="h-5 w-5" />,
      });
      return;
    }

    console.log("rubyBalance", rubyBalance);

    if (
      paymentOption === "ruby" &&
      (rubyBalance || rubyBalance === 0) &&
      rubyBalance < 50
    ) {
      toast.error("Not Enough RUBY", {
        description: "You need at least 50 RUBY to join.",
        icon: <XCircle className="h-5 w-5" />,
      });
      return;
    }

    if (paymentOption === "sui") {
      const coinBalance = await client.getBalance({ owner: account.address });
      if (Number(coinBalance.totalBalance) < ENTRY_FEE) {
        toast.error("Not Enough SUI", {
          description: "You need more SUI to join",
          icon: <XCircle className="h-5 w-5" />,
        });
        return;
      }
    }

    setIsLoadingJoin(true);

    // If all checks pass, proceed with the transaction
    signAndExecuteTransaction(
      {
        transaction: buildJoinRoundTx(),
        chain: `sui:${suiEnv}`,
      },
      {
        onSuccess: async (result) => {
          toast.success("Success!", {
            description: "You have successfully joined the round.",
            icon: <CheckCircle className="h-5 w-5" />,
          });
          setIsLoadingJoin(false);
          await refetch();
          await refetchBalance();
          if (paymentOption === "ruby") {
            await refetchRubyBalance();
          }
        },
        onError: (error) => {
          toast.error("Transaction Failed", {
            description:
              error.message || "An error occurred while joining the round.",
            icon: <XCircle className="h-5 w-5" />,
          });
          setIsLoadingJoin(false);
          console.error("error", error);
        },
      }
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-8 bg-amber-100 text-black">
      {/* Game Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 items-center mb-8 w-full max-w-7xl">
        {/* empty left cell */}
        <div className="hidden sm:block"></div>

        {/* middle cell */}
        <Image
          src="/logo.png"
          className="justify-self-center drop-shadow-md w-[100px] sm:w-[140px]"
          width={140}
          height={140}
          alt="SPOT GAME logo"
        />

        {/* right cell */}
        <div className="flex items-center gap-x-2 justify-self-end mr-10 2xl:mr-0">
          {account?.address === admin && (
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsAdminOpen(true)}
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          )}
          <a
            href={`https://faucet.sui.io/?address=${account?.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex justify-center gap-x-1 mr-2 sm:mr-4"
          >
            <span className="relative top-0.5 hidden lg:block">Get Faucet</span>{" "}
            <Image src={"/faucet.png"} width={24} height={12} alt="faucet" />
          </a>
          <ConnectButton className="hover:cursor-pointer" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl px-4">
        {/* Left Column - Game Board */}
        <div className="flex-grow">
          <Card className="border-2 border-amber-700 bg-amber-50 p-4">
            <SpotGameBoard
              maxNum={MAX_NUM}
              selected={selected}
              lastWinning={roundInfo.lastWinning}
              toggleNumber={toggleNumber}
            />

            {/* Game Stats and Controls */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <GameInfo
                paymentOption={paymentOption}
                onChangePaymentOption={setPaymentOption}
              />

              {/* Action Buttons */}
              <div className="flex flex-col col-span-1 mb-3 lg:mb-0">
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="destructive"
                    className="bg-red-400 hover:bg-red-500 text-white hover:cursor-pointer"
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="default"
                    className="bg-yellow-400 hover:bg-yellow-500 text-black hover:cursor-pointer"
                    onClick={autoPick}
                  >
                    Autopick
                  </Button>
                </div>
                <div className="text-base text-center mt-2 lg:mt-6">
                  SUI Balance:
                  {isLoadingBalance ? (
                    <Spinner className="ml-2" size={"xs"} />
                  ) : (
                    <span className="ml-2">
                      {formatSui(suiBalance?.totalBalance ?? 0)}
                    </span>
                  )}
                </div>
                <div className="text-base text-center mt-1">
                  RUBY Balance:
                  {isLoadingRubyBalance || isLoading || isLoadingBalance ? (
                    <Spinner className="ml-2" size={"xs"} />
                  ) : (
                    <span className="ml-2">
                      {formatNumber(rubyBalance ?? 0, 0)}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-base text-center lg:text-left lg:ml-5 space-y-2">
                <div>
                  Number of Players:
                  {isLoading ? (
                    <Spinner className="ml-2" size={"xs"} />
                  ) : (
                    <span className="ml-2">
                      {roundInfo.players.toLocaleString()}
                    </span>
                  )}
                </div>
                <div>
                  Round time left:
                  {isLoading ? (
                    <Spinner className="ml-2" size={"xs"} />
                  ) : (
                    <span className="ml-2">
                      {formatTime(roundInfo.timeLeft)}
                    </span>
                  )}
                </div>
                <div className="lg:mt-8 font-bold">
                  Round #
                  {isLoading ? <Spinner size={"xs"} /> : roundInfo.roundNumber}
                </div>
              </div>
            </div>

            {/* Play Button */}
            <Button
              className="w-full mt-4 bg-green-400 hover:bg-green-500 text-lg h-12 hover:cursor-pointer"
              onClick={joinRound}
            >
              {isLoadingJoin ? <Spinner size={"sm"} /> : "Play/Stake"}
            </Button>
          </Card>
        </div>

        {/* Right Column - Payout Table */}
        <div className="flex flex-col-reverse lg:flex-col lg:w-96">
          <PayoutTable />

          {/* Game Info Card */}
          <Card className="col-span-1 border-2 border-amber-700 bg-amber-200 p-4 mb-4 lg:mt-[18px] rounded-b-lg ">
            <p className="mb-2 text-center">
              12 numbers are randomly drawn in each round.
            </p>
            <p className="mb-2 text-center">
              Correctly pick one or more out of 10 to win.
            </p>
            <p className="text-center">Round Time : 10m</p>
          </Card>
        </div>
      </div>
      {isAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="space-y-4 p-6 w-full max-w-md border-2 border-amber-700 bg-amber-200">
            <h2 className="text-xl font-semibold">Trigger New Round</h2>

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                VRF Output (hex)
              </label>
              <input
                className="w-full border px-3 py-2 rounded"
                value={outputHex}
                onChange={(e) => setOutputHex(e.target.value)}
                placeholder="e.g. 9edc19ef…"
              />

              <label className="block text-sm font-medium">
                Alpha String (utf-8)
              </label>
              <input
                className="w-full border px-3 py-2 rounded"
                value={alphaString}
                onChange={(e) => setAlphaString(e.target.value)}
                placeholder="Hello, world!"
              />

              <label className="block text-sm font-medium">Proof (hex)</label>
              <input
                className="w-full border px-3 py-2 rounded"
                value={proofHex}
                onChange={(e) => setProofHex(e.target.value)}
                placeholder="cc27939e…"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsAdminOpen(false)}>Cancel</Button>
              <Button onClick={doTrigger}>Confirm</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
