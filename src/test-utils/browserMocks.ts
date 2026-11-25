import { vi } from "vitest";
import { resetAudioForTests } from "@/lib/sound";

/** jsdom has no Web Audio. This fake records what the app plays. */
export function installAudioMock() {
  const oscillators: { type: string; start: ReturnType<typeof vi.fn> }[] = [];
  const peakLevels: number[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  class MockAudioContext {
    state = "suspended";
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.state = "running";
    });
    createGain() {
      const gain = param();
      // The envelope's first ramp goes to the peak level for this sound.
      gain.exponentialRampToValueAtTime.mockImplementationOnce((value: number) => {
        peakLevels.push(value);
      });
      return { gain, connect: vi.fn() };
    }
    createOscillator() {
      const oscillator = { type: "", frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(oscillator);
      return oscillator;
    }
  }
  resetAudioForTests();
  vi.stubGlobal("AudioContext", MockAudioContext);
  /** How many meows were played (each meow uses two oscillators). */
  const meows = () => oscillators.filter((o) => o.start.mock.calls.length > 0).length / 2;
  return { meows, peakLevels };
}
