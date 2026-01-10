import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "2ndlook",
  version: packageJson.version,
  copyright: `© ${currentYear}, 2ndlook.`,
  meta: {
    title: "2ndlook - Connect & See",
    description:
      "2ndlook helps owner-led businesses create snapshots of recent patterns from their estimating tools. Connect, import, and see what's happening—no ongoing sync required.",
  },
};
