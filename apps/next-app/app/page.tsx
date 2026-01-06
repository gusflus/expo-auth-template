"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
} from "aws-amplify/auth";
import { useEffect, useState } from "react";

const formFields = {
  signUp: {
    email: {
      order: 1,
      isRequired: true,
    },
    username: {
      order: 2,
      isRequired: true,
    },
    password: {
      order: 3,
    },
    confirm_password: {
      order: 4,
    },
  },
};

const services = {
  async handleSignInWithGoogle() {
    console.log("Google sign-in initiated");
    try {
      // This will be handled by Amplify automatically
      console.log("Amplify should handle this automatically");
    } catch (error) {
      console.error("Google sign-in error:", error);
    }
  },
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-slate-50">
      <Authenticator formFields={formFields} services={services} socialProviders={['google']}>
        {({ signOut }) => (
          <div className="w-full max-w-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">Session Debugger</h1>
              <button
                onClick={signOut}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
              >
                Sign Out
              </button>
            </div>

            <UserDataDisplay />
          </div>
        )}
      </Authenticator>
    </main>
  );
}

function UserDataDisplay() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function getSessionData() {
      try {
        // 1. Get basic user info (ID and Username)
        const user = await getCurrentUser();

        // 2. Get the actual JWT tokens
        const session = await fetchAuthSession();

        // 3. Get profile details - OAuth users get info from ID token
        let attributes = {};
        if (session.tokens?.idToken) {
          const payload = session.tokens.idToken.payload;
          attributes = {
            email: payload.email,
            given_name: payload.given_name,
            family_name: payload.family_name,
            name: payload.name,
          };
        } else {
          // For non-OAuth users, try fetching attributes
          try {
            attributes = await fetchUserAttributes();
          } catch (error) {
            console.log("Could not fetch user attributes:", error);
          }
        }

        setData({
          userId: user.userId,
          username: user.username,
          attributes: attributes,
          // The ID Token contains the "claims" about the user
          idToken: session.tokens?.idToken?.toString(),
          // The Access Token is used for API authorization
          accessToken: session.tokens?.accessToken?.toString(),
        });
      } catch (err) {
        console.error("Error fetching session:", err);
      }
    }

    getSessionData();
  }, []);

  if (!data) return <p>Loading session data...</p>;

  return (
    <div className="space-y-4">
      {/* Basic Profile */}
      <section className="p-4 bg-white shadow rounded-lg border">
        <h2 className="font-semibold mb-2 border-b pb-1">User Profile</h2>
        <p>
          <strong>User ID:</strong> {data.userId}
        </p>
        <p>
          <strong>Email:</strong> {data.attributes.email || 'N/A'}
        </p>
        {data.attributes.name && (
          <p>
            <strong>Name:</strong> {data.attributes.name}
          </p>
        )}
      </section>

      {/* JWT Tokens */}
      <section className="p-4 bg-white shadow rounded-lg border">
        <h2 className="font-semibold mb-2 border-b pb-1 text-blue-600">
          ID Token (JWT)
        </h2>
        <div className="bg-slate-900 text-green-400 p-3 rounded text-xs overflow-x-auto break-all font-mono">
          {data.idToken}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tip: You can paste this into{" "}
          <a href="https://jwt.io" target="_blank" className="underline">
            jwt.io
          </a>{" "}
          to see the decoded payload.
        </p>
      </section>
    </div>
  );
}
