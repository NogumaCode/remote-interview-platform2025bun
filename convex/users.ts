import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ユーザーを同期するためのミューテーション
export const syncUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    clerkId: v.string(),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // データベースから、指定されたclerkIdを持つ既存ユーザーを検索
    const existingUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkId"), args.clerkId))// clerkIdが一致するものをフィルタ
      .first(); // 最初の一致を取得

      // 既存ユーザーが見つかった場合、処理を終了
    if (existingUser) return;

    // 新しいユーザーをデータベースに挿入
    return await ctx.db.insert("users", {
      ...args,
      role: "candidate",
    });
  },
});

// すべてのユーザーを取得するクエリ
export const getUsers = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("User is not authenticated");
// データベースからすべてのユーザーを取得
    const users = await ctx.db.query("users").collect();

    return users;
  },
});

// clerkIdを使用して特定のユーザーを取得するクエリ
export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return user;
  },
});
