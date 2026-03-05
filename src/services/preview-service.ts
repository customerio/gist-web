import { UserNetworkInstance, getNetworkErrorResponse } from "./network";
import type { NetworkResponse } from "./network";
import type { StepDisplayConfig } from "../types";

export async function savePreviewDisplaySettings(
  cioPreviewId: string,
  displaySettings: StepDisplayConfig[],
): Promise<NetworkResponse | undefined> {
  try {
    const response = await UserNetworkInstance()(
      `/api/v1/preview/${cioPreviewId}`,
      {
        method: "POST",
        body: JSON.stringify(displaySettings),
        headers: { "Content-Type": "application/json" },
      },
    );
    return response;
  } catch (error) {
    return getNetworkErrorResponse(error);
  }
}
