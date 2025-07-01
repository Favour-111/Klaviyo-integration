require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const klaviyoAPIKey = process.env.klaviyoAPIKey; // Private API Key
const listId = process.env.listId; // List ID

console.log(klaviyoAPIKey);

// Step 1: Create or update profile
async function createOrUpdateProfile(email, phone) {
  const response = await fetch("https://a.klaviyo.com/api/profiles/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Klaviyo-API-Key ${klaviyoAPIKey}`,
      revision: "2023-10-15",
    },
    body: JSON.stringify({
      data: {
        type: "profile",
        attributes: {
          email,
          ...(phone && { phone_number: phone }), // only include phone if present
        },
      },
    }),
  });

  const text = await response.text();
  let result;

  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Invalid response from Klaviyo.");
  }

  if (!response.ok) {
    const error = result.errors?.[0];
    if (error) {
      const errorCode = error.code;
      const detail = error.detail;

      if (errorCode === "duplicate_profile") {
        return error.meta.duplicate_profile_id; // reuse existing ID
      }

      throw new Error(detail || "Failed to create/update profile.");
    }

    throw new Error("Unknown error creating/updating profile.");
  }

  return result.data.id;
}

// Step 2: Add profile to list
async function addToList(profileId) {
  const response = await fetch(
    `https://a.klaviyo.com/api/lists/${listId}/relationships/profiles/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Klaviyo-API-Key ${klaviyoAPIKey}`,
        revision: "2023-10-15",
      },
      body: JSON.stringify({
        data: [{ type: "profile", id: profileId }],
      }),
    }
  );

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Invalid JSON response from Klaviyo.");
  }

  if (!response.ok) {
    const error = result.errors?.[0];
    if (error) {
      throw new Error(error.detail || "Failed to add to list.");
    }
    throw new Error("Unknown error adding to list.");
  }

  return result;
}

// POST endpoint
app.post("/subscribe", async (req, res) => {
  const { email, phone } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const profileId = await createOrUpdateProfile(email, phone);
    await addToList(profileId);
    res.json({ message: "Subscribed successfully!" });
  } catch (err) {
    console.error("Klaviyo error:", err.message);
    res
      .status(400)
      .json({ message: "Failed to subscribe", error: err.message });
  }
});
app.get("/test-auth", async (req, res) => {
  try {
    const response = await fetch("https://a.klaviyo.com/api/lists/", {
      method: "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${klaviyoAPIKey}`,
        revision: "2023-10-15",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: "Invalid API Key or error occurred", error: data });
    }

    res.json({ message: "API key is valid!", lists: data.data });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error verifying key", error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
