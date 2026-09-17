import type { ComputerCatAPI } from "../shared/contracts";

declare global {
  interface Window {
    computerCat: ComputerCatAPI;
  }
}
