import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={"light"}
      className="toaster group text-amber-900"
      toastOptions={{
        style: {
          background: "#fef3c7", // amber-50
          color: "#78350f", // amber-900
          border: "1px solid #fbbf24", // amber-400
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
