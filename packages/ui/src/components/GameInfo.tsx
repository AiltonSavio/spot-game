import React from "react";
import { Card } from "@/components/ui/card";

export type PaymentOption = "sui" | "ruby";

interface GameInfoProps {
  paymentOption: PaymentOption;
  onChangePaymentOption: (opt: PaymentOption) => void;
}

const GameInfo: React.FC<GameInfoProps> = ({
  paymentOption,
  onChangePaymentOption,
}) => {
  return (
    <div className="flex flex-col gap-4 col-span-1">
      <div className="flex gap-4">
        <Card className="flex-1 p-2 text-center bg-white border border-amber-700">
          <div className="text-xs mb-1">Entry Fee</div>
          <div className="text-[11px] font-bold leading-5">
            0.1 SUI or 50 RUBY
          </div>
        </Card>

        {/* Radio group for payment option */}
        <Card className="flex-1 p-2 bg-white border border-amber-700">
          {/* ml-1 sm:ml-3 lg:ml-0 */}
          <fieldset className="flex h-full w-full lg:flex-col gap-1 sm:gap-3 lg:gap-0" aria-label="Payment Option">
            {(
              [
                { value: "sui", label: "0.1 SUI" },
                { value: "ruby", label: "50 RUBY" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center rounded text-black cursor-pointer`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={opt.value}
                  checked={paymentOption === opt.value}
                  onChange={() => onChangePaymentOption(opt.value)}
                  className="mr-1 sm:mr-2 form-radio h-4 w-4"
                />
                <span className="text-xs sm:text-sm">{opt.label}</span>
              </label>
            ))}
          </fieldset>
        </Card>
      </div>

      <Card className="p-2 bg-white border border-amber-700">
        <div className="text-xs text-center">Color Key</div>
        <div className="flex gap-4 justify-center mt-1">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-amber-400 mr-1" />
            <span className="text-xs">empty</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-purple-400 mr-1" />
            <span className="text-xs">spot</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-blue-400 mr-1" />
            <span className="text-xs">last drawn</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default GameInfo;
