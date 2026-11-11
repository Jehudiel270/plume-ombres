// ============================================================
// lib/roles.test.ts — Matrice rôles × permissions, et règles de
// SUPPRESSION d'un compte.
//
// Ces règles sont partagées par la route serveur
// (/api/admin/comptes/supprimer) et par l'interface : les tester ici
// prouve les deux à la fois.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PERMISSIONS,
  PERMISSIONS_INTERDITES,
  ROLES,
  aLaPermission,
  permissionPourChangerRole,
  permissionPourSupprimerCompte,
} from './roles';

test('suppression d’un utilisateur : permission d’exploitation', () => {
  assert.equal(permissionPourSupprimerCompte('utilisateur'), 'admin.comptes.supprimer');
  assert.equal(aLaPermission('admin', 'admin.comptes.supprimer'), true);
  assert.equal(aLaPermission('super_admin', 'admin.comptes.supprimer'), true);
  assert.equal(aLaPermission('utilisateur', 'admin.comptes.supprimer'), false);
});

test('suppression d’un administrateur : réservée au super-administrateur', () => {
  for (const cible of ['admin', 'super_admin'] as const) {
    const requise = permissionPourSupprimerCompte(cible);
    assert.equal(requise, 'admin.roles.super_admin');
    assert.equal(aLaPermission('super_admin', requise), true);
    // Un admin ne peut pas supprimer un autre admin : pas d'escalade.
    assert.equal(aLaPermission('admin', requise), false);
    assert.equal(aLaPermission('utilisateur', requise), false);
  }
});

test('l’interface et la base lisent la MÊME règle que celle des rôles', () => {
  // La suppression d'un administrateur exige exactement la permission
  // forte qui protège les comptes super-administrateurs.
  assert.equal(
    permissionPourSupprimerCompte('admin'),
    permissionPourChangerRole('utilisateur', 'super_admin')
  );
  assert.equal(
    permissionPourSupprimerCompte('super_admin'),
    permissionPourChangerRole('super_admin', 'utilisateur')
  );
});

test('aucune permission interdite n’est accordée, à aucun rôle', () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS_INTERDITES) {
      assert.equal(aLaPermission(role, permission), false, `${role} / ${permission}`);
    }
  }
});

test('toute permission déclarée est accordée à au moins un rôle', () => {
  for (const permission of PERMISSIONS) {
    if (PERMISSIONS_INTERDITES.includes(permission)) continue;
    const accordee = ROLES.some((role) => aLaPermission(role, permission));
    assert.equal(accordee, true, `${permission} n'est accordée à aucun rôle`);
  }
});
