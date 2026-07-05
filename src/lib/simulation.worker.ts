import { optimizeDesigns, simulateDesign } from "./acoustics";
import type { BoxDesign, OptimizerGoal, SimulationOutput, SpeakerDriver, SplInputMode } from "./acoustics";

type SimulationWorkerRequest =
  | {
      id: number;
      type: "chart";
      driver: SpeakerDriver;
      designs: BoxDesign[];
      frequencyMaxHz: number;
      powerW: number;
      splInputMode?: SplInputMode;
      outputs: SimulationOutput[];
    }
  | {
      id: number;
      type: "analysis";
      driver: SpeakerDriver;
      designs: BoxDesign[];
      powerW: number;
      splInputMode?: SplInputMode;
      goal: OptimizerGoal;
    };

type SimulationWorkerResponse =
  | {
      id: number;
      type: "chart";
      results: ReturnType<typeof simulateDesign>[];
    }
  | {
      id: number;
      type: "analysis";
      candidates: ReturnType<typeof optimizeDesigns>;
      results: ReturnType<typeof simulateDesign>[];
    }
  | {
      id: number;
      type: "error";
      message: string;
    };

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === "chart") {
      postMessage({
        id: request.id,
        type: "chart",
        results: request.designs.map((design) =>
          simulateDesign(request.driver, design, {
            frequencyMaxHz: request.frequencyMaxHz,
            powerW: request.powerW,
            splInputMode: request.splInputMode,
            outputs: request.outputs,
          }),
        ),
      } satisfies SimulationWorkerResponse);
      return;
    }

    postMessage({
      id: request.id,
      type: "analysis",
      candidates: optimizeDesigns(request.driver, request.powerW, request.goal, request.splInputMode),
      results: request.designs
        .filter((design) => design.enabled)
        .map((design) => simulateDesign(request.driver, design, {
          powerW: request.powerW,
          splInputMode: request.splInputMode,
        })),
    } satisfies SimulationWorkerResponse);
  } catch (error) {
    postMessage({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed",
    } satisfies SimulationWorkerResponse);
  }
};
