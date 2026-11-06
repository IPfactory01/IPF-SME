import { createContext, useContext } from "react";

/**
 * Preview as client: the team sees the room as its owner does, with every action switched off. The server would refuse
 * these actions from staff anyway; this only keeps the preview honest about what can be clicked.
 */
export const RoomPreviewContext = createContext(false);
export const useRoomPreview = () => useContext(RoomPreviewContext);
