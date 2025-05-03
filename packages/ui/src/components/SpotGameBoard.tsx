import React from "react";
import { cn } from "@/lib/utils";

interface SpotGameBoardProps {
  maxNum: number;
  selected: number[];
  lastWinning?: number[];
  toggleNumber: (n: number) => void;
}

const SpotGameBoard: React.FC<SpotGameBoardProps> = ({
  maxNum,
  selected,
  lastWinning,
  toggleNumber,
}) => {
  // Create an array of numbers from 1 to maxNum
  const numbers = Array.from({ length: maxNum }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-x-5 tiny:gap-x-9 lg:gap-x-5 xl:gap-x-9 gap-y-3">
      {numbers.map((num) => (
        <button
          key={num}
          onClick={() => toggleNumber(num)}
          className={cn(
            "aspect-square rounded-full border-2 border-dashed flex items-center justify-center text-lg font-bold transition-all hover:cursor-pointer",
            selected.includes(num)
              ? "bg-purple-400 hover:bg-purple-500 text-white border-purple-900"
              : lastWinning?.includes(num)
                ? "bg-blue-400 hover:bg-blue-500 text-white border-blue-900"
                : "bg-amber-400 hover:bg-amber-500 text-amber-900 border-amber-700"
          )}
        >
          {num}
        </button>
      ))}
    </div>
  );
};

export default SpotGameBoard;
