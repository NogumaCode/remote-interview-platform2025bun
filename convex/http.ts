import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { api } from "./_generated/api";

// HTTPルーターを作成
const http = httpRouter();

// "/clerk-webhook" エンドポイントに対するPOSTリクエストを処理するルートを定義
http.route({
  path: "/clerk-webhook", // Webhookを受け取るURL
  method: "POST", // HTTPのPOSTメソッドを指定
  handler: httpAction(async (ctx, request) => { // リクエストを処理するハンドラー

    // 環境変数からClerkのWebhook秘密キーを取得
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // 環境変数が設定されていない場合はエラーをスロー
      throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
    }

    // リクエストヘッダーからSvixの必要な情報を取得（署名やIDなど）
    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");

    // 必要なヘッダーが揃っていない場合はエラーレスポンスを返す
    if (!svix_id || !svix_signature || !svix_timestamp) {
      return new Response("No svix headers found", {
        status: 400, // HTTPステータス400: クライアントエラー
      });
    }

    // リクエストボディをJSONとして取得し、文字列に変換
    const payload = await request.json();
    const body = JSON.stringify(payload);

    // Webhook検証用のインスタンスを作成
    const wh = new Webhook(webhookSecret);
    let evt: WebhookEvent; // ClerkのWebhookイベントを格納する変数

    try {
      // Webhookの署名を検証し、正しいイベントか確認
      evt = wh.verify(body, {
        "svix-id": svix_id, // WebhookのID
        "svix-timestamp": svix_timestamp, // Webhookのタイムスタンプ
        "svix-signature": svix_signature, // Webhookの署名
      }) as WebhookEvent;
    } catch (err) {
      // 検証エラー時にログを出力し、エラーレスポンスを返す
      console.error("Error verifying webhook:", err);
      return new Response("Error occurred", { status: 400 });
    }

    // Webhookイベントの種類を取得
    const eventType = evt.type;

    // イベントが "user.created"（ユーザー作成）の場合
    if (eventType === "user.created") {
      // イベントデータから必要な情報を取得
      const { id, email_addresses, first_name, last_name, image_url } = evt.data;

      // ユーザーのメールアドレスを取得
      const email = email_addresses[0].email_address;
      // ユーザーの名前を結合（姓と名を空白でつなぐ）
      const name = `${first_name || ""} ${last_name || ""}`.trim();

      try {
        // Convexのデータベースにユーザー情報を保存
        await ctx.runMutation(api.users.syncUser, {
          clerkId: id, // ClerkのユーザーID
          email, // メールアドレス
          name, // 名前
          image: image_url, // プロフィール画像URL
        });
      } catch (error) {
        // ユーザー作成中のエラーをログに出力し、エラーレスポンスを返す
        console.log("Error creating user:", error);
        return new Response("Error creating user", { status: 500 });
      }
    }

    // Webhookが正常に処理された場合のレスポンスを返す
    return new Response("Webhook processed successfully", { status: 200 });
  }),
});

// HTTPルーターをデフォルトエクスポート
export default http;
