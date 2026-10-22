/**
 * Test-only crash points. Payment code calls `checkpoint("release.after_provider")`
 * between steps; a test registers a hook there to simulate the process dying
 * (the hook throws) or a concurrent action landing mid-operation (the hook
 * runs it). With no hooks registered, a checkpoint is a no-op, and hooks can
 * never be registered in production.
 */
type Hook = () => void | Promise<void>;

const hooks = new Map<string, Hook>();

export async function checkpoint(name: string): Promise<void> {
  const hook = hooks.get(name);
  if (hook) await hook();
}

export function onCheckpoint(name: string, hook: Hook): void {
  if (process.env.NODE_ENV === "production") throw new Error("Checkpoints are test-only");
  hooks.set(name, hook);
}

export function clearCheckpoints(): void {
  hooks.clear();
}

/** Thrown by test hooks to stand in for the process dying at a checkpoint. */
export class SimulatedCrash extends Error {
  constructor(at: string) {
    super(`Simulated crash at ${at}`);
    this.name = "SimulatedCrash";
  }
}
