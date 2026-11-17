import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter" // optional if using DB
import CredentialsProvider from "next-auth/providers/credentials"

export default NextAuth({
  providers: [
    // Example: CredentialsProvider({ ... })
    // Add GoogleProvider, GitHubProvider, etc. here
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
