const SB_URL = "https://rgyvkqvqdncszbxnmbyy.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneXZrcXZxZG5jc3pieG5tYnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTY5MDMsImV4cCI6MjA5Mjc5MjkwM30.186O8VIA2Medvzd7klrqmwPgJurRqpl3eHVTDwwWUVM";

// Initialize Supabase Client
const sbClient = supabase.createClient(SB_URL, SB_KEY);

const INITIAL_CONFIG = {
    RANK_ORDER: ["COMMANDER", "ASST_COMMANDER", "LIEUTENANT", "SERGEANT", "CORPORAL", "SENIOR_OPERATOR", "OPERATOR"],
    RANK_LABELS: {
        COMMANDER: "Commander", ASST_COMMANDER: "Asst. Commander", LIEUTENANT: "Lieutenant",
        SERGEANT: "Sergeant", CORPORAL: "Corporal", SENIOR_OPERATOR: "Senior Operator", OPERATOR: "Operator"
    },
    ROLE_NAMES: { 1: "Point", 2: "Assault", 3: "Breach", 4: "Slack" },
    COMMAND_RANKS: ["COMMANDER", "ASST_COMMANDER"],
    COMMAND_CALLSIGNS: {COMMANDER: "K-01", ASST_COMMANDER: "K-02"}
};