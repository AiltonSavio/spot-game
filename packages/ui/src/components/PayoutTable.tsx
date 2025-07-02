import React from "react";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

const pools = [
  100, 500, 1_000, 5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000,
];

const PayoutTable: React.FC = () => {
  const distribution = Array(pools.length).fill(0);

  return (
    <Card className="border-2 border-amber-700">
      <div className="bg-yellow-300 text-black py-2 text-center font-bold text-lg border-b rounded-t-lg border-amber-700">
        Pay Outs
      </div>

      <div>
        <div className="grid grid-cols-2 text-center bg-amber-200 py-2 font-medium">
          <div>SPOT STRIKE</div>
          <div>Bucket (in RUBY)</div>
        </div>

        {distribution.map((_, idx) => {
          const isEven = idx % 2 === 0;
          return (
            <div
              key={idx}
              className={cn(
                "grid grid-cols-2 text-center py-3 font-medium",
                isEven ? "bg-gray-200" : "bg-amber-200",
                idx === pools.length - 1 ? "rounded-b-lg" : ""
              )}
            >
              <div>{idx + 1}</div>
              <div>{formatNumber(pools[idx], 0)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default PayoutTable;
