// Test stand-in for '@/lib/drawup-server' and '@/lib/drawup-quick': no database, no AI.
module.exports = {
  adminSelectOne: async () => null, adminRest: async () => ({ ok: false, json: async () => [] }),
  adminRpc: async () => 0, isHqAccount: async () => false, fastModels: () => ['test-model'],
};
