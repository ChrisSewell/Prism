import { useState, useCallback } from "react";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PinDialogProps {
  open: boolean;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string | null;
}

export function PinDialog({ open, onSubmit, onCancel, error }: PinDialogProps) {
  const [pin, setPin] = useState("");

  const isValid = /^\d{4,8}$/.test(pin);

  const handleSubmit = useCallback(() => {
    if (isValid) {
      onSubmit(pin);
    }
  }, [pin, isValid, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-center">Room PIN Required</DialogTitle>
          <DialogDescription className="text-center">
            This room requires a PIN to join. Enter the PIN provided by the room creator.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <Input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 8);
              setPin(v);
            }}
            className="font-mono text-center text-lg tracking-[0.3em]"
            autoFocus
          />

          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              Join Room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
