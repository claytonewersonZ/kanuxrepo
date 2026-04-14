"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import apiClient from "@/lib/apiClient";

export default function ProfileCard(){
  const [profile, setProfile] = useState<any>(null);

  useEffect(()=>{
    (async ()=>{
      const { data: { user } } = await supabase.auth.getUser();
      if(!user) return;
      const profileResponse = await apiClient.getProfile();
      setProfile(profileResponse.data);
    })();
  },[]);

  if(!profile) return <div className="p-4">Sem perfil</div>
  return (
    <div className="p-4">
      <div className="font-semibold">{profile.display_name ?? profile.email}</div>
      <div className="text-sm text-gray-600">{profile.email}</div>
    </div>
  )
}
