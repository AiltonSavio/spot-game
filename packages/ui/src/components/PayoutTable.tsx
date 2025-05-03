import React from "react";
import { Card } from "@/components/ui/card";
import { formatSui } from "@/lib/utils";
import { Spinner } from "./ui/spinner";

interface PayoutTableProps {
  pools: any[];
  distribution: number[];
  isLoading: boolean;
}

const PayoutTable: React.FC<PayoutTableProps> = ({
  pools,
  distribution,
  isLoading,
}) => {
  return (
    <Card className="border-2 border-amber-700">
      <div className="bg-yellow-300 text-black py-2 text-center font-bold text-lg border-b rounded-t-lg border-amber-700">
        Pay Outs
      </div>

      <div className="">
        <div className="grid grid-cols-3 text-center bg-amber-200 py-2 font-medium">
          <div>SPOT STRIKE</div>
          <div>% of Pool</div>
          <div>Bucket</div>
        </div>

        {distribution.map((percentage, idx) => {
          const isEven = idx % 2 === 0;
          return (
            <div
              key={idx}
              className={cn(
                "grid grid-cols-3 text-center py-3 font-medium",
                isEven ? "bg-gray-200" : "bg-amber-200",
                idx === 9 ? "rounded-b-lg" : ""
              )}
            >
              <div>{idx + 1}</div>
              <div>{percentage}</div>
              <div>
                {isLoading ? (
                  <Spinner size={"xs"} />
                ) : (
                  formatSui(pools[idx]?.fields?.balance, 4) || 0
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// Helper function for class names
const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(" ");
};

export default PayoutTable;
