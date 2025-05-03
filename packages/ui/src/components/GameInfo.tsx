import React from "react";
import { Card } from "@/components/ui/card";
import { formatSui } from "@/lib/utils";
import { Spinner } from "./ui/spinner";

interface GameInfoProps {
  roundInfo: {
    roundNumber: number;
    poolSize: number;
    players: number;
    timeLeft: number;
  };
  isLoading: boolean;
}

const GameInfo: React.FC<GameInfoProps> = ({ roundInfo, isLoading }) => {
  return (
    <div className="flex flex-col gap-4 col-span-1">
      <div className="flex gap-4">
        <Card className="flex-1 p-2 text-center bg-white border border-amber-700">
          <div className="text-xs">Entry Fee</div>
          <div className="font-bold">1 SUI</div>
        </Card>
        <Card className="flex-1 p-2 text-center bg-white border border-amber-700">
          <div className="text-xs">Round Size</div>
          <div className="font-bold">
            {isLoading ? (
              <Spinner size={"xs"} />
            ) : (
              formatSui(roundInfo.poolSize)
            )}{" "}
            SUI
          </div>
        </Card>
      </div>

      <Card className="p-2 bg-white border border-amber-700">
        <div className="text-xs text-center">Color Key</div>
        <div className="flex gap-4 justify-center mt-1">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-amber-400 mr-1"></div>
            <span className="text-xs">empty</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-purple-400 mr-1"></div>
            <span className="text-xs">spot</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-blue-400 mr-1"></div>
            <span className="text-xs">last drawn</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default GameInfo;
